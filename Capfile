=begin
  See the deploy section of the readme file to get this up and running
=end

require 'railsless-deploy'
require 'net/http'
require 'pp'

set :stages, %w(staging production)
set :default_stage, "staging"
require 'capistrano/ext/multistage'

# Define the shell commands to run to start, stop and restart.  We'll use cap to abstract all these
def start_command(port, stage)
  "start paddie PORT=#{port} ENV=#{stage}"
end

def stop_command(port, stage)
  "stop paddie PORT=#{port}"
end

def restart_command(port, stage)
  "restart paddie PORT=#{port}"
end

def stop_all_command(stage)
  "initctl emit stop-all-paddies"
end

def perform_healthcheck(hostname_and_port)
  Net::HTTP.get_response URI.parse('http://' + hostname_and_port + '/healthcheck') rescue nil
end

def wait_until_up(hostname_and_port)
  while !(r = perform_healthcheck(hostname_and_port)) || r.code != "200" do
    sleep 1
  end
end

# Non environment specific options

ssh_options[:forward_agent] = true

set :user, 'paddie'
#set :runner, fetch(:user)
set :application, 'paddie'
set :deploy_to, "/opt/#{application}"

set :scm, :git
set :scm_username, 'polotek'
set :scm_password, 'Polotek99'
set :repository, 'https://github.com/yammer/etherpad-lite.git'

