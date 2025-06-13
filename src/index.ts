process.setMaxListeners(0);
import App from "./app";

const main = () => {
  const app = new App();
  app.start();
};

main();
