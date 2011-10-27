var ueberDB = require("ueberDB");
var settings = require("../node/utils/Settings");
var log4js = require("log4js");
var async = require("async");

var db = new ueberDB.database(settings.dbType, settings.dbSettings, null, log4js.getLogger("ueberDB"));

db.init(updateDatabase);

function updateDatabase()
{
  db.db.wrappedDB.db.query('SELECT "key", "value" FROM "store" WHERE "key" like \'pad%\' and "pad_id" IS NULL', function(err, result) {
    if(err)
    {
      console.log("Error fetching rows from database: " + err);
      return;
    }
    console.log(result.rows.length);

    for( var i = 0; i < result.rows.length; i++ )
    {
      (function(e) {
        var myKey = result.rows[e].key;
        db.get(myKey, function(error, res){ 
          
          //console.log(JSON.parse(res));
          if(error){
            return;
          }
          if(! res instanceof Object)
          {
            res = JSON.parse(res); 
          }
          db.set(myKey, res, function(err1, result1){
            if(err1)
            {
              console.log("Error fetching rows from database: " + err1);
              return;
            }
            console.log("Successfully updated: " + myKey)
          });
        });
      })(i);
    }
  });
}