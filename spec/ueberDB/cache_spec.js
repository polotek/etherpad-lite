// require your source here
foounit.require(':spec/spec_helper');

var layer = foounit.require(':ueberDB/CacheAndBufferLayer')
  , pg = foounit.require(':ueberDB/pgsql_db');

describe('cache', function (){
  var db, pgdb;

  before(function (){
    pgdb = new pg.database({
     "user"    : "postgres", 
     "host"    : "localhost", 
     "password": "", 
     "database": "yam_pages_test"
    });

    db = new layer.database(pgdb, null, console);
   
    var success;
    db.init(function (err){
      if (!err){ success = true; }
    });

    waitFor(function (){
      expect(success).to(beTrue);
    });
  });

  after(function (){
    var success;
    db.close(function (err){
      success = true;
    });

    waitFor(function (){
      expect(success).to(beTrue);
    });
  });

  describe('when there is a failure on flush', function (){
    it('retries the db operations', function (){
      var flushCallback = mock(function (){});

      // enqueues a bulk operation which calls doBulk within 100ms
      db.set('k1', 'v1', null, flushCallback);
      db.set('k2', 'v2', null, flushCallback);
      db.set('k3', 'v3', null, flushCallback);

      var callbackSuccess; 

      var doBulkMock = mock(pgdb, 'doBulk', function (operations, callback){
        // fail on first call to doBulk
        if (doBulkMock.callCount == 0){
          // asserting dirty == false for each operation because
          // operations are flagged as not dirty just before the
          // doBulk call.  This is a little counter-intuitive.
          Object.keys(operations).forEach(function (operation){
            expect(operation.dirty).to(beFalse);
          });

          // simulating a failure from the driver layer
          callback(new Error('you suck'));
        } else {
          // on the second try simulate success from the driver layer
          callback();
          // helps us assert that a second try occurred
          callbackSuccess = true;
        }
      });

      // assert that the caching layer uses doBulk when a writeInterval
      // is set.
      waitFor(function (){
        expect(doBulkMock).to(haveBeenCalled);
      });

      // assert retry
      waitFor(function (){
        expect(callbackSuccess).to(beTrue);
      });

      // assert that the caching layer is in a good state after
      // a failure has been retried
      run(function (){
        var keys = Object.keys(db.buffer);

        // assert that the cache was written through to the database
        expect(keys.length).to(be, 3);
        keys.forEach(function (k){
          expect(db.buffer[k].dirty).to(beFalse);
        });

        // flush callback should be called once for each set operation
        expect(flushCallback).to(haveBeenCalled, 3);
      });
    });
  });
});
