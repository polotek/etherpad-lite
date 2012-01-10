var Changeset = require("./Changeset");
var async = require("async");
var exportHtml = require('./ExportHtml');

function PadDiff (pad, fromRev, toRev){      
  //check parameters
  if(!pad || !pad.id || !pad.atext || !pad.pool)
  {
    throw new Error("first parameter is not a pad");
  }
  if(typeof fromRev != "number" || fromRev < 0 || fromRev > pad.head)
  {
    throw new Error("fromRev '" + fromRev + "' is invalid");
  }
  if(typeof toRev != "number" || toRev < 0 || toRev <= fromRev || toRev > pad.head)
  {
    throw new Error("toRev '" + fromRev + "' is invalid");
  }
  
  this._pad = pad;
  this._fromRev = fromRev;
  this._toRev = toRev;
  this._html = null;
  this._authors = [];
}

PadDiff.prototype._isClearAuthorship = function(changeset){
  //unpack
  var unpacked = Changeset.unpack(changeset);
  
  //check if there is nothing in the charBank
  if(unpacked.charBank !== "")
    return false;
  
  //check if oldLength == newLength
  if(unpacked.oldLen !== unpacked.newLen)
    return false;
 
  //lets iterator over the operators
  var iterator = Changeset.opIterator(unpacked.ops);
  
  //get the first operator, this should be a clear operator
  var clearOperator = iterator.next();
  
  //check if there is only one operator
  if(iterator.hasNext() === true)
    return false;
    
  //check if this operator doesn't change text
  if(clearOperator.opcode !== "=")
    return false;
    
  //check that this operator applys to the complete text
  //if the text ends with a new line, its exactly one character less, else it has the same length
  if(clearOperator.chars !== unpacked.oldLen-1 && clearOperator.chars !== unpacked.oldLen)
    return false;
  
  var attributes = [];
  Changeset.eachAttribNumber(changeset, function(attrNum){
    attributes.push(attrNum);
  });
    
  //check that this changeset uses only one attribute
  if(attributes.length !== 1)
    return false;
    
  var appliedAttribute = this._pad.pool.getAttrib(attributes[0]);
  
  //check if the applied attribute is an anonymous author attribute
  if(appliedAttribute[0] !== "author" || appliedAttribute[1] !== "")
    return false;
    
  return true;
}

PadDiff.prototype._createClearAuthorship = function(rev, callback){
  var self = this;
  this._pad.getInternalRevisionAText(rev, function(err, atext){
   if(err){
     return callback(err);
   }
   
   //build clearAuthorship changeset
   var builder = Changeset.builder(atext.text.length);
   builder.keepText(atext.text, [['author','']], self._pad.pool);
   var changeset = builder.toString();
   
   callback(null, changeset);
  });
}

PadDiff.prototype._createClearStartAtext = function(rev, callback){
  var self = this;
  
  //get the atext of this revision
  this._pad.getInternalRevisionAText(rev, function(err, atext){
   if(err){
     return callback(err);
   }
   
   //create the clearAuthorship changeset
   self._createClearAuthorship(rev, function(err, changeset){
     if(err){
       return callback(err);
     }
   
     //apply the clearAuthorship changeset
     var newAText = Changeset.applyToAText(changeset, atext, self._pad.pool);
     
     callback(null, newAText);
   });
  });
}

PadDiff.prototype._getChangesetsInBulk = function(startRev, count, callback) {
  var self = this;
  
  //find out which revisions we need
  var revisions = [];
  for(var i=startRev;i<(startRev+count) && i<=this._pad.head;i++){
    revisions.push(i);
  }
  
  var changesets = [], authors = [];
  
  //get all needed revisions
  async.forEach(revisions, function(rev, callback){
    self._pad.getRevision(rev, function(err, revision){
      if(err){
        return callback(err)
      }
      
      var arrayNum = rev-startRev;
      
      changesets[arrayNum] = revision.changeset;
      authors[arrayNum] = revision.meta.author;
  
      callback();
    });
  }, function(err){
    callback(err, changesets, authors);
  });
}

PadDiff.prototype._addAuthors = function(authors) {
  var self = this;
  //add to array if not in the array
  authors.forEach(function(author){
    if(self._authors.indexOf(author) == -1){
      self._authors.push(author);
    }
  });
}

PadDiff.prototype._createDiffAtext = function(callback) {
  var self = this;
  var bulkSize = 100;
  
  //get the cleaned startAText
  self._createClearStartAtext(self._fromRev, function(err, atext){
    if(err) throw err;
    
    var rev = self._fromRev + 1;
    
    //async while loop
    async.whilst(
      //loop condition
      function () { return rev < self._toRev; },
      
      //loop body
      function (callback) {
        //get the bulk
        self._getChangesetsInBulk(rev,bulkSize,function(err, changesets, authors){
          var addedAuthors = [];
          
          //run trough all changesets
          for(var i=0;i<changesets.length && (rev+i)<=self._toRev;i++){
            var changeset = changesets[i];
            
            //skip clearAuthorship Changesets
            if(self._isClearAuthorship(changeset)){
              continue;
            }
            
            //add this author to the authorarray
            addedAuthors.push(authors[i]);
            
            //apply the changeset
            atext = Changeset.applyToAText(changeset, atext, self._pad.pool);
          }
          
          //add the authors to the PadDiff authorArray
          self._addAuthors(addedAuthors);
        
          //lets continue with the next bulk 
          rev += bulkSize;
          callback();
        });
      },
      
      //after the loop has ended
      function (err) {
        callback(err, atext);
      }
    );
  });
}

PadDiff.prototype.getHtml = function(callback){
  //cache the html
  if(this._html != null){
    return callback(null, this._html);
  }
  
  var self = this;
  var atext, html, authorColors;
  
  async.series([
    //get the diff atext
    function(callback){
      self._createDiffAtext(function(err, _atext){
        if(err){
          return callback(err);
        }
        
        atext = _atext;
        callback();
      });
    },
    //get the authorColor table
    function(callback){
      self._pad.getAllAuthorColors(function(err, _authorColors){
        if(err){
          return callback(err);
        }
        
        authorColors = _authorColors;
        callback();
      });
    },
    //convert the atext to html
    function(callback){
      html = exportHtml.getHTMLFromAtext(self._pad, atext, authorColors);
      self._html = html;
      callback();
    }
  ], function(err){
    callback(err, html);
  });
}

PadDiff.prototype.getAuthors = function(callback){
  var self = this;
  
  //check if html was already produced, if not produce it, this generates the author array at the same time
  if(self._html == null){
    self.getHtml(function(err){
      if(err){
        callback(err);
      }
      
      callback(null, self._authors);
    });
  } else {
    callback(null, self._authors);
  }
}

//export the constructor
module.exports = PadDiff;
