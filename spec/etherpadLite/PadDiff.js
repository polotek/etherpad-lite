var async = require("async")
  , padManager = foounit.require(':src/db/PadManager')
  , Changeset = foounit.require(':src/utils/Changeset')
  , padDiff = foounit.require(':src/utils/PadDiff');

var pad, testPadDiff;

// get a new pad each time
before(function (){
  pad = null;

  //load the sample pad
  padManager.getPad("www.yammer.dev-19", function(err, _pad){
    if(err) throw err;

    pad = _pad;

    testPadDiff = new padDiff(pad, 0, 490);
  });

  waitFor(function() {
    expect(pad).toNot(beNull);
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
      testPadDiff._getChangesetsInBulk(pad.head-49,100,function(err, changesets, authors){
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

  describe('the _addAuthors method', function(){
    it('adds new authors', function(){
      testPadDiff._authors = ["d"];
      testPadDiff._addAuthors(["a","b","c"]);

      expect(testPadDiff._authors.length).to(equal, 4);
    });

    it('doesn\'t add known authors', function(){
      testPadDiff._authors = ["a"];
      testPadDiff._addAuthors(["a","b","c"]);

      expect(testPadDiff._authors.length).to(equal, 3);
    });

    //clean the authors after each operation
    after(function(){
      testPadDiff._authors = [];
    });
  });

  describe('the _createDiffAtext method', function(){
    it('returns an atext that is longer or equal that the the toRev text', function(){
      var done = false;

      //create some test diffs with random revision numbers
      var testDiffs = [];
      testDiffs.push(new padDiff(pad, 111, 490));
      testDiffs.push(new padDiff(pad, 57, 312));
      testDiffs.push(new padDiff(pad, 0, 497));
      testDiffs.push(new padDiff(pad, 213, 290));
      testDiffs.push(new padDiff(pad, 333, 480));
      testDiffs.push(new padDiff(pad, 85, 106));
      testDiffs.push(new padDiff(pad, 85, 86));
      testDiffs.push(new padDiff(pad, 0, 1));
      testDiffs.push(new padDiff(pad, 233, 234));
      testDiffs.push(new padDiff(pad, 472, 473));
      testDiffs.push(new padDiff(pad, 471, 472));

      //run trough all testDiffs
      async.forEachSeries(testDiffs, function(testDiff, callback){

        testDiff._createDiffAtext(function(err, newAText){
          if(err) throw err;

          pad.getInternalRevisionAText(testDiff._toRev, function(err, origAText){
            if(err) throw err;

            //check if we have a larger or at least the same text
            expect(origAText.text.length <= newAText.text.length).to(beTrue);

            //if the text has changed, there must be authors in the author array
            if(origAText.text != newAText.text) {
              //check if there are authors in the author array
              expect(testDiff._authors.length).toNot(equal, 0);
            }

            callback();
          });
        });
      }, function(err){
        if(err) throw err;
        done = true;
      });

      waitFor(function(){
        expect(done).to(beTrue);
      });
    });
  });

  describe('the _extendChangesetWithAuthor method', function(){
    var originalChangesets = [];
    var extendedChangesets = [];
    var authors = [];

    before(function(){
      var revisions2Test = [];
      for(var i=0;i<=pad.head;i++)
      {
        revisions2Test.push(i);
      }

      var counter = revisions2Test.length;

      //get all changesets, extend them and save them
      revisions2Test.forEach(function(rev){
        pad.getRevision(rev, function(err, revision){
          if(err) throw err;

          var changeset = revision.changeset;
          var author = revision.meta.author;

          var extendChangeset = testPadDiff._extendChangesetWithAuthor(changeset, author, pad.pool);

          originalChangesets[rev] = changeset;
          extendedChangesets[rev] = extendChangeset;
          authors[rev] = author;

          counter--;
        });
      });

      waitFor(function(){
        expect(counter).to(equal, 0);
      });
    });

    describe(" it ", function(){
      it("didn't change the changeset without an author", function(){
        for(var i=0;i<=pad.head;i++)
        {
          if(authors[i] === ""){
            expect(originalChangesets[i]).to(equal, extendedChangesets[i])
          }
        }
      });

      it("added a 'deleted' attribute to the attribute pool", function(){
        expect(pad.pool.putAttrib(["removed", true]), true).toNot(equal, -1);
      });

      it("it added the correct attributes to all minus operators of changesets with an author", function(){
        for(var i=0;i<=pad.head;i++)
        {
          if(authors[i] !== ""){
            var unpacked = Changeset.unpack(extendedChangesets[i]);
            var iterator = Changeset.opIterator(unpacked.ops);

            var authorAttrib = pad.pool.putAttrib(["author", authors[i]]);
            var deletedAttrib = pad.pool.putAttrib(["removed", true]);
            var attribs = "*" + Changeset.numToString(authorAttrib) + "*" + Changeset.numToString(deletedAttrib);

            //iteratore over the operators of the changeset
            while(iterator.hasNext()){
              var operator = iterator.next();

              if(operator.opcode === "-"){
                expect(operator.attribs).to(equal,attribs);
              }
            }
          }
        }
      });
    });
  });

  describe('the _createDeletionChangeset method', function(){
    //the changeset it outputs has the correct startLength
    //it output Length is larger or the same than the input length
    //

    var originalChangesets = [];
    var addDeletionsChangesets = [];

    before(function(){
      var revisions2Test = [];
      for(var i=1;i<=pad.head;i++)
      {
        revisions2Test.push(i);
      }

      var counter = revisions2Test.length;

      //get all changesets, extend them and save them
      revisions2Test.forEach(function(rev){
        pad.getRevision(rev, function(err, revision){
          pad.getInternalRevisionAText(rev-1, function(err, origAText){
            if(err) throw err;

            var changeset = revision.changeset;

            var addDeletions= testPadDiff._createDeletionChangeset(changeset, origAText, pad.pool);

            originalChangesets[rev] = changeset;
            addDeletionsChangesets[rev] = addDeletions;

            counter--;
          });
        });
      });

      waitFor(function(){
        expect(counter).to(equal, 0);
      });
    });

    describe(" it ", function(){
      it("the oldLen of the new Changeset = the newLength of the oldChangeset", function(){
        for(var i=1;i<=pad.head;i++)
        {
          var deletionUnpacked = Changeset.unpack(addDeletionsChangesets[i]);
          var originalUnpacked = Changeset.unpack(originalChangesets[i]);

          expect(deletionUnpacked.oldLen).to(equal, originalUnpacked.newLen);
        }
      });

      it("the newLen of the deletionChangeset must be greater or equal than the oldLen", function(){
        for(var i=1;i<=pad.head;i++)
        {
          var deletionUnpacked = Changeset.unpack(addDeletionsChangesets[i]);

          expect(deletionUnpacked.newLen >= deletionUnpacked.oldLen).to(beTrue);
        }
      });
    });
  });
});
