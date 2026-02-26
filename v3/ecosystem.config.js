module.exports = {
    apps: [{
        name: 'ramadanflow',
        script: 'server.js',
        cwd: '/home/pi/ramadanflow/v3',
        env: {
            NODE_ENV: 'production',
            PORT: 3000
        },
        instances: 1,
        autorestart: true,
        watch: false,
        max_memory_restart: '150M',
        log_file: '/home/pi/ramadanflow/logs/app.log',
        error_file: '/home/pi/ramadanflow/logs/error.log',
        time: true
    }]
};
