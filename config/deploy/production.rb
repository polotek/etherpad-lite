set :branch,     'master' unless exists?(:branch)
set :ports,      [9001, 9002, 9003, 9004, 9005, 9006]

server 'paddie-001.sjc1.yammer.com', :paddie
server 'paddie-002.sjc1.yammer.com', :paddie
server 'paddie-002.sjc1.yammer.com', :paddie

