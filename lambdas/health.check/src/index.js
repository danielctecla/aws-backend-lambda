const { HealthController } = require('/opt/nodejs/presentation/controllers');

const healthController = new HealthController();

exports.handler = async () => {
    return await healthController.healthCheck();
};
