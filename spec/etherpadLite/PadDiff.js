var padDiff = foounit.require(':src/utils/PadDiff');
var settings = foounit.require(':src/utils/Settings');
var Changeset = foounit.require(':src/utils/Changeset');
var path = require("path");
var pad, testPadDiff;

//init everything
before(function (){
  //use the sample pad database
  settings.dbType = "dirty";
  settings.dbSettings = { "filename" : path.join(__dirname, "../samplePad_dirty.db") };
  
  //since the db settings are manipulated, we can load the db module
  var db = foounit.require(':src/db/DB'); 
  
  //init database
  var padLoaded = false;
  db.init(function(err){
    if(err) throw err;
  
    //load the padManager
    var padManager = foounit.require(':src/db/PadManager');
    
    //load the sample pad
    padManager.getPad("www.yammer.dev-19", function(err, _pad){
      if(err) throw err;
      
      pad = _pad;
      padLoaded = true;
      
      testPadDiff = new padDiff(pad, 0, 490);
    });
  });
  
  //wait for database init
  waitFor(function (){
    expect(padLoaded).to(beTrue);
  });
});

describe('PadDiff', function (){
  describe('the constructor', function(){
    it("saves the three variables it gets", function(){
      var diff = new padDiff(pad, 0, 1);
      expect(diff._pad).to(equal, pad);
      expect(diff._fromRev).to(equal, 0);
      expect(diff._toRev).to(equal, 1);
    });
    
    it("checks if the first parameter is a pad", function(){
      expect(function(){
        new padDiff({}, 0, 1);
      }).to(throwError);
    });
    
    it("checks if the second parameter is a valid start number", function(){
      //negativ number
      expect(function(){
        new padDiff(pad, -1, 1);
      }).to(throwError);
      
      //string
      expect(function(){
        new padDiff(pad, "string", 1);
      }).to(throwError);
      
      //object
      expect(function(){
        new padDiff(pad, {}, 1);
      }).to(throwError);
      
      //over 9000 (larger than the end revision)
      expect(function(){
        new padDiff(pad, 9001, 9010);
      }).to(throwError);
    });
    
    it("checks if the third parameter is a valid end number", function(){
      //negativ number
      expect(function(){
        new padDiff(pad, -1, 1);
      }).to(throwError);
      
      //string
      expect(function(){
        new padDiff(pad, "string", 1);
      }).to(throwError);
      
      //object
      expect(function(){
        new padDiff(pad, {}, 1);
      }).to(throwError);
      
      //over 9000 (larger than the end revision)
      expect(function(){
        new padDiff(pad, 1, 9001);
      }).to(throwError);
      
      //smaller than the start rev
      expect(function(){
        new padDiff(pad, 9010, 9000);
      }).to(throwError);
    });
  });
  
  describe('the _isClearauthorship method', function() {
    it('recognzies changesets that clears the authorship', function(){
      var changesetLoaded = false;
      
      pad.getRevisionChangeset(472, function(err, changeset){
        if(err) throw err;
        
        expect(testPadDiff._isClearAuthorship(changeset)).to(beTrue);
        changesetLoaded = true;
      });
      
      waitFor(function(){
        expect(changesetLoaded).to(beTrue);
      })
    });
    
    it('let normal changesets pass', function(){
      //get all revision numbers that are no clearAuthorship commits
      var revisions2Test = [];
      for(var i=0;i<=pad.head;i++)
      {
        //skip the one clearAuthorship Changeset
        if(i == 472) continue;
        
        revisions2Test.push(i);
      }
      
      var counter = revisions2Test.length;
      
      revisions2Test.forEach(function(rev){
        pad.getRevisionChangeset(rev, function(err, changeset){
          if(err) throw err;
          
          expect(testPadDiff._isClearAuthorship(changeset)).to(beFalse);
          counter--;
        });
      });
      
      waitFor(function(){
        expect(counter).to(equal, 0);
      });
    });
  });
  
  describe('the _createClearAuthorship method', function() {
    it('creates proper clearAuthorship changesets', function(){
      var revisions2Test = [];
      for(var i=0;i<=pad.head;i++)
      {        
        revisions2Test.push(i);
      }
      
      var counter = revisions2Test.length;
      
      revisions2Test.forEach(function(rev){
        pad.getInternalRevisionAText(rev, function(err, atext){
          if(err) throw err;
          
          testPadDiff._createClearAuthorship(rev, function(err, changeset){
            if(err) throw err;
            
            //test if this a clearAuthorship Changeset
            expect(testPadDiff._isClearAuthorship(changeset)).to(beTrue);
            
            var unpacked = Changeset.unpack(changeset);
            
            //check if we applied to the correct revision
            //we do this by comparing the text lengths
            expect(unpacked.oldLen).to(equal, atext.text.length);
            
            counter--;
          });
        });
      });
      
      waitFor(function(){
        expect(counter).to(equal, 0);
      });
    });
  });
  
  describe('the _createClearStartAtext method', function(){
    it('returns an atext that has no author attribute but the same text', function(){
      var revisions2Test = [];
      for(var i=0;i<=pad.head;i++)
      {        
        revisions2Test.push(i);
      }
      
      var counter = revisions2Test.length;
      
      revisions2Test.forEach(function(rev){
        pad.getInternalRevisionAText(rev, function(err, origAText){
          if(err) throw err;
          
          testPadDiff._createClearStartAtext(rev, function(err, clearedAText){
            if(err) throw err;
            
            //check text
            expect(clearedAText.text).to(equal,origAText.text);
            
            var iter = Changeset.opIterator(clearedAText.attribs);
            while (iter.hasNext()) {
              var op = iter.next();
              var authorValue = Changeset.opAttributeValue(op, 'author', pad.pool);
              
              //we should get an empty string if there is no author attribute
              expect(authorValue).to(equal, '');
            }
            
            counter--;
          });
        });
      });
      
      waitFor(function(){
        expect(counter).to(equal, 0);
      });
    });
  });
  
  describe('the _getChangesetsInBulk method', function(){    
    it('returns the correct amount of changesets and authors', function(){
      testPadDiff._getChangesetsInBulk(0,100,function(err, changesets, authors){
        if(err) throw err;
        
        expect(changesets.length).to(equal, 100);
        expect(authors.length).to(equal, 100);
        
        gotFirst100Changesets = true;
      });
      
      waitFor(function(){
        expect(gotFirst100Changesets).to(beTrue);
      });
    })
    
    it('stops at the head revision', function(){
      //get the last 50 revisions to check them
      testPadDiff._getChangesetsInBulk(pad.head-50,100,function(err, changesets, authors){
        if(err) throw err;
        
        expect(changesets.length).to(equal, 50);
        expect(authors.length).to(equal, 50);
        
        gotLast50Changesets = true;
      });
      
      waitFor(function(){
        expect(gotLast50Changesets).to(beTrue);
      });
    });
  });
});
