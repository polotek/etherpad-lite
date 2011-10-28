var ueberDB = require("ueberDB");
var settings = require("../node/utils/Settings");
var log4js = require("log4js");
var async = require("async");

var db = new ueberDB.database(settings.dbType, settings.dbSettings, null, log4js.getLogger("ueberDB"));

db.init(updateDatabase);

function updateDatabase()
{
  db.db.wrappedDB.db.query('SELECT "key" FROM "store" WHERE "key" like \'pad%\' and "pad_id" IS NULL', function(err, result) {
    if(err)
    {
      console.log("Error fetching rows from database: " + err);
      return;
    }
    console.log("Found " + result.rows.length + " matching rows.");

    for( var i = 0; i < result.rows.length; i++ )
    {
      (function(e) {
        var key = result.rows[e].key;

        db.get(key, function(error, value){ 
          
          if(error)
          {
            console.log("Error getting values for key: " + key);
            return;
          }
          if(! value instanceof Object)
          {
            value = JSON.parse(value); 
          }
          
          db.set(key, value, function(error, setResult){
            if(error)
            {
              console.log("Error updating database for key: " + key + " : " + error);
              return;
            }
            console.log("Successfully updated: " + key);
          });
        });
      })(i);
    }
  });
}