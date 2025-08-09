const { ProductController } = require('/opt/nodejs/presentation/controllers');

const productController = new ProductController();

exports.handler = async () => {
  return await productController.getProducts();
};
