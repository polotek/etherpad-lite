/*
This module opens a repl on a unix socket. 
You can connect to this socket with 
socat - UNIX-CONNECT:/tmp/paddie-9001.sock
*/

var net = require("net");
var repl = require("repl");
var util = require("util");
var pth = require("path");

var loadedModules = require("module")._cache;

exports.listen = function(port)
{
  net.createServer(function (socket) 
  {
    var context = {};
    var modules = [];
    var projectPath = pth.resolve('.');

    for(var path in loadedModules)
    {
      //this module is not part of etherpad lite, skip it
      if(path.indexOf(projectPath) == -1 || path.indexOf("node_modules") != -1)
      {
        continue;
      }
      
      //get the moduleName
      var pathParts = path.split("/");
      var moduleFileName = pathParts[pathParts.length-1];
      var moduleName = moduleFileName.substr(0, moduleFileName.length-3);
      
      //add the module to the context
      context[moduleName] = loadedModules[path].exports;
      
      //relativePath
      var relativePath = path.substr(projectPath.length);
      
      //build the descriptonLine
      var moduleDescLine = moduleName;
      while(moduleDescLine.length < 25)
      {
        moduleDescLine+=" ";
      }
      moduleDescLine+= " = " + relativePath;
      
      modules.push(moduleDescLine);
    }
    
    //start the repl instance on this socket
    var replInstance = repl.start("> ", socket, null, true);
    
    //write the welcome text
    var welcomeText = "\nYou can access the modules with these variables:\n\n" + modules.sort().join("\n") + "\n\n" + 
                      "You also have a printCallback function which prints out what it gets.\ne.g PadManager.doesPadExists('test', printCallback);" + 
                      "\n\n> ";
    replInstance.outputStream.write(welcomeText);
    
    //move all modules to the context object
    for(var key in context)
    {
      replInstance.context[key] = context[key];
    }
    
    //create a defaultCallback
    replInstance.context.printCallback = function()
    {
      var text = "";
      
      for(var i=0;i<arguments.length;i++)
      {
        text+="arguments[" + i + "] = " + util.inspect(arguments[i]) + "\n";
      }
      
      replInstance.outputStream.write(text);
    }
    
    //recreate the console object
    replInstance.context.console = 
    {
      log: function (str) {
        replInstance.outputStream.write(str + "\n")
      },
      error: function (str) {
        replInstance.outputStream.write(str + "\n")
      }
    }
  }).listen("/tmp/paddie-"+port +".sock");
}
