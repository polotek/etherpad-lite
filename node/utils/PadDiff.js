var Changeset = require("./Changeset");
var async = require("async");

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
  this._authors = null;
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
  for(var i=startRev;i<(startRev+count) && i<this._pad.head;i++){
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

//_getChangesetsInBulk(startRev, count) 

//export the constructor
module.exports = PadDiff;
