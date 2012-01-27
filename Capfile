set :stages,        %w(staging production)
set :default_stage, 'staging'
require 'capistrano/ext/multistage'
require 'pp'
require 'curl'
require 'yajl'
require 'fileutils'
require 'railsless-deploy' 

set :application,   'paddie'
set :owner,         'paddie'
set :owner_group,   'eng'
set :deploy_to,     "/opt/#{application}"
set :deploy_via,    :remote_cache
set :scm,           :git
set :scm_verbose,   true
set :repository,    'git@github.com:yammer/etherpad-lite.git'

## state to notify yammer of deploys
set :yn_step,          0
set :yn_reply_to_id,   nil

ssh_options[:forward_agent] = true

namespace :deploy do
  task :default do
    transaction do
      update
      restart
    end
  end

  task :setup_fix_permissions do
    sudo "mkdir -p #{deploy_to}"
    sudo "chown -R #{owner}:#{owner_group} #{deploy_to}"
  end
  after "deploy:setup", "deploy:setup_fix_permissions"

  task :update_application_configuration do
    sudo "cp #{current_release}/settings-#{stage}.json #{current_release}/settings.json"
  end
  after "deploy:update_code", "deploy:update_application_configuration"

  task :update_system_etc do
    sudo "cp #{current_release}/bin/paddie.upstart /etc/init/paddie.conf"
    sudo "cp #{current_release}/config/haproxy/#{stage}.cfg /etc/haproxy/paddie.cfg"
  end
  after "deploy:update_code", "deploy:update_system_etc"

  task :update_code_fix_permissions do
    sudo "chown -R #{owner}:#{owner_group} #{current_release}"
    sudo "chown -R #{owner}:#{owner_group} #{shared_path}"
    sudo "chmod -R g+w #{shared_path}"
  end 
  after "deploy:update_code", "deploy:update_code_fix_permissions"

  task :npm_rebuild do
    ## ugh, this sucks; also order matters, this has to happen after a build of perms have
    ## been fixed by pdate_code_fix_permissions
    commands  = [] 
    commands << "cd #{current_release}"
    commands << "sudo -u paddie npm rebuild"
    run commands.join(' && ')
  end
  after "deploy:update_code", "deploy:npm_rebuild"


  task :start do
    find_servers.sort.each do |server|
      ports.each do |port|
        sudo "start paddie PORT=#{port} ENV=#{stage}", :hosts => [ server ]
      end
    end
  end

  task :stop do 
    find_servers.sort.each do |server|
      logger.info "stopping all paddies on #{server}"
      sudo "initctl emit stop-all-paddies"
    end
  end


  task :restart do
    find_servers.sort.each do |server|
      logger.info "disabling haproxy on #{server}"
      sudo "#{current_release}/bin/haproxyctl disable", :hosts => server
      sudo "initctl emit stop-all-paddies; sleep 1",    :hosts => server

      logger.info "resting for ten seconds"
      sleep 10

      logger.info "starting paddie on ports #{ports.first} to #{ports.last}"
      ports.each do |port|
        sudo "start paddie PORT=#{port};", :hosts => server
      end

      ## FIXME: should restart haproxy
      logger.info "restarting haproxy"
      sudo "#{current_release}/bin/haproxy_reload.sh -n paddie", :hosts => server
    end
  end

  
  task :notify_yammer_about_deploy do 
    begin
      permalink = `git config yammer.permalink`.chomp
      user      = $? == 0 ? "@#{permalink}" : `whoami`.chomp.downcase
      
      body = case yn_step.to_i
        when 0 then "#{user} is deploying Paddie branch=#{branch} to #{stage}"
        when 1 then "Finished deploying!"
        else        "Expect the unexpected!"
      end
      
      groupid = case stage.to_s
        when /thunderdome/ then 1380
        when /prod/        then 323
        when /stage/       then 849
        else                    849
      end
      
      params    = []
      params   << Curl::PostField.content('replied_to_id', yn_reply_to_id) if yn_reply_to_id
      params   << Curl::PostField.content('group_id', groupid.to_s)
      params   << Curl::PostField.content('body', body)
      response  = Curl::Easy.http_post("https://www.staging.yammer.com/api/v1/messages.json?access_token=YtseU6j94nALx6qXq4wqUQ", params)

      if response.response_code == 201
        message    = Yajl::Parser.parse(response.body_str)['messages'].first
        message_id = message['id']
        set :yn_reply_to_id, message_id
        logger.info "success! posted message to yammer and got message_id=#{yn_reply_to_id}"
      end

    rescue => e
      logger.info "Posting to Yammer: #{e}"
      logger.info "Moving On!"
    ensure
      set :yn_step, yn_step + 1
    end
  end
  before "deploy", "deploy:notify_yammer_about_deploy"
  after  "deploy", "deploy:notify_yammer_about_deploy"

  task :test_notify_yammer_about_deploy do
    logger.info "sleeping for 5"
  end  
  before "deploy:test_notify_yammer_about_deploy", "deploy:notify_yammer_about_deploy"
  after  "deploy:test_notify_yammer_about_deploy", "deploy:notify_yammer_about_deploy"

end
