set :branch,     'master' unless exists?(:branch)
set :ports,      [9001, 9002, 9003]

#server 'stagepaddie-001.sjc1.yammer.com', :feweb
server 'stagepaddie-002.sjc1.yammer.com', :feweb

