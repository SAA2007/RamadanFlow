module.exports = {
    apps: [{
        name: 'ramadanflow',
        script: 'server.js',
        cwd: __dirname,
        env: {
            NODE_ENV: 'production',
            PORT: 3000
        },
        instances: 1,
        autorestart: true,
        watch: false,
        max_memory_restart: '150M',
        log_file: __dirname + '/../logs/app.log',
        error_file: __dirname + '/../logs/error.log',
        time: true
    }]
};
