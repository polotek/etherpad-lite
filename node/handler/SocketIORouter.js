/**
 * This is the Socket.IO Router. It routes the Messages between the
 * components of the Server. The components are at the moment: pad and timeslider
 */

/*
 * 2011 Peter 'Pita' Martischka (Primary Technology Ltd)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var log4js = require('log4js');
var messageLogger = log4js.getLogger("message");
var securityManager = require("../db/SecurityManager");

/**
 * Saves all components
 * key is the component name
 * value is the component module
 */
var components = {};

var socket;

/**
 * adds a component
 */
exports.addComponent = function(moduleName, module)
{
  //save the component
  components[moduleName] = module;

  //give the module the socket
  module.setSocketIO(socket);
}

/**
 * sets the socket.io and adds event functions for routing
 */
exports.setSocketIO = function(_socket)
{
  //save this socket internaly
  socket = _socket;

  socket.set('authorization', function (handshakeData, callback) {
    var message = handshakeData.query;
    securityManager.checkAccess (message.padId, message.sessionID, message.token, message.authtoken, message.password, message.user_id, function(err, statusObject)
    {
      if(err) return callback(err);

      // set the auth status for later retrieval
      handshakeData.auth = statusObject

      //access was granted, mark the client as authorized and handle the message
      if(statusObject.accessStatus == "grant")
      {
        return callback(null, true);
      }
      //no access, send the client a message that tell him why
      else
      {
        messageLogger.warn("Authentication try failed:" + stringifyWithoutPassword(message));
      }

      return callback(null, false);
    });
  });

  socket.sockets.on('connection', function(client)
  {
    var clientReadyMsg = client.handshake.query
      , clientAuthorized = false
      , authStatus;

    if(client.handshake && client.handshake.auth) {
      authStatus = client.handshake.auth;
      clientAuthorized = true;
    } else {
      messageLogger.error('Received connection with no auth status. handshake data: ', client.handshake);
      return;
    }

    if(client.transport) {
      messageLogger.error('socket.io transport type ', client.transport);
      // send metrics for transport type
    }

    //wrap the original send function to log the messages
    client._send = client.send;
    client.send = function(message)
    {
      messageLogger.debug("to " + client.id + ": " + stringifyWithoutPassword(message));
      client._send(message);
    }

    //tell all components about this connect
    for(var i in components)
    {
      components[i].handleConnect(client, authStatus);
    }

    //try to handle the message of this client
    function handleMessage(message)
    {
      if(message.component && components[message.component])
      {
        //check if component is registered in the components array
        if(components[message.component])
        {
          messageLogger.debug("from " + client.id + ": " + stringifyWithoutPassword(message));
          components[message.component].handleMessage(client, message, authStatus);
        }
      }
      else
      {
        messageLogger.error("Can't route the message:" + stringifyWithoutPassword(message));
      }
    }

    client.on('message', function(message)
    {
      if(message.protocolVersion && message.protocolVersion != 2)
      {
        messageLogger.error("Protocolversion header is not correct:" + stringifyWithoutPassword(message));
        return;
      }

      //client is authorized, everything ok
      if(clientAuthorized)
      {
        handleMessage(message);
      }
      else
      {
        //drop message
        messageLogger.warn("Dropped message due to bad permissions:" + stringifyWithoutPassword(message));
      }
    });

    client.on('disconnect', function()
    {
      //tell all components about this disconnect
      for(var i in components)
      {
        components[i].handleDisconnect(client);
      }
    });

    // After all the setup, we treat this as "CLIENT_READY"
    handleMessage(clientReadyMsg);
  });
}

//returns a stringified representation of a message, removes the password
//this ensures there are no passwords in the log
function stringifyWithoutPassword(message)
{
  var newMessage = {};

  for(var i in message)
  {
    if(i == "password" && message[i] != null)
      newMessage["password"] = "xxx";
    else
      newMessage[i]=message[i];
  }

  return JSON.stringify(newMessage);
}
