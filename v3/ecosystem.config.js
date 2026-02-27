module.exports = {
    apps: [{
        name: 'ramadanflow',
        script: 'server.js',
        cwd: __dirname,
        env: {
            NODE_ENV: 'production',
            PORT: 3000
        },
        exec_mode: 'fork',
        autorestart: true,
        watch: false,
        max_memory_restart: '150M',
        time: true
    }]
};
