import "@babel/polyfill";
import dotenv from "dotenv";
dotenv.config();
import "isomorphic-fetch";
import {
  createShopifyAuth,
  verifyToken,
  getQueryKey,
} from "koa-shopify-auth-cookieless";
import { graphQLProxy, ApiVersion } from "koa-shopify-graphql-proxy-cookieless";
import Koa from "koa";
import next from "next";
import Router from "koa-router";
import { receiveWebhook, registerWebhook } from '@shopify/koa-shopify-webhooks';
import getSubscriptionUrl from './server/getSubscriptionUrl';
import isVerified from "shopify-jwt-auth-verify";
import db from './models';
const jwt = require("jsonwebtoken");

const port = parseInt(process.env.PORT, 10) || 3000;
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

const {
  SHOPIFY_API_SECRET_KEY,
  SHOPIFY_API_KEY,
  HOST,
} = process.env;

app.prepare().then(() => {
  const server = new Koa();
  const router = new Router();
  server.keys = [SHOPIFY_API_SECRET_KEY];

  server.use(
    createShopifyAuth({
      apiKey: SHOPIFY_API_KEY,
      secret: SHOPIFY_API_SECRET_KEY,
      scopes: ['read_products', 'write_products'], //FIXME: use env SCOPES
      async afterAuth(ctx) {
        const shopKey = ctx.state.shopify.shop;
        const accessToken = ctx.state.shopify.accessToken;
        await db.Shop.findOrCreate({
          where: { shop: shopKey },
          defaults: {
            accessToken: accessToken
          }
        }).then(([newShop, created]) => {
          if (created) {
            console.log("created.", shopKey, accessToken);
          } else {
            newShop.update({
              accessToken: accessToken
            }).then(() => {
              console.log("updated.", shopKey, accessToken);
            });
          }
        });
        const registration = await registerWebhook({
          address: `${HOST}/webhooks/products/create`,
          topic: 'PRODUCTS_CREATE',
          accessToken: accessToken,
          shop: shopKey,
          apiVersion: ApiVersion.October20
        });

        if (registration.success) {
          console.log('Successfully registered webhook!');
        } else {
          console.log('Failed to register webhook', registration.result);
        }
        await getSubscriptionUrl(ctx, accessToken, shopKey);
      }
    })
  );

  const webhook = receiveWebhook({ secret: SHOPIFY_API_SECRET_KEY });

  router.post('/webhooks/products/create', webhook, (ctx) => {
    console.log('received webhook: ', ctx.state.webhook);
  });

  router.post("/graphql", async (ctx, next) => {
    const bearer = ctx.request.header.authorization;
    const secret = process.env.SHOPIFY_API_SECRET_KEY;
    const valid = isVerified(bearer, secret);
    if (valid) {
      const token = bearer.split(" ")[1];
      const decoded = jwt.decode(token);
      const shop = new URL(decoded.dest).host;
      const dbShop = await db.Shop.findOne({ where: { shop: shop } });
      if (dbShop) {
        const accessToken = dbShop.accessToken;
        const proxy = graphQLProxy({
          shop: shop,
          password: accessToken,
          version: ApiVersion.October20,
        });
        await proxy(ctx, next);
      } else {
        ctx.res.statusCode = 403;
      }
    }
  });
  router.get('/', async (ctx, next) => {
    const shop = getQueryKey(ctx, "shop");
    const dbShop = await db.Shop.findOne({ where: { shop: shop } });
    const token = dbShop && dbShop.accessToken;
    ctx.state = { shopify: { shop: shop, accessToken: token } };
    await verifyToken(ctx, next);
  });

  router.get('/(.*)', async (ctx) => {
    await handle(ctx.req, ctx.res);
    ctx.respond = false;
    ctx.res.statusCode = 200;
  });

  server.use(router.allowedMethods());
  server.use(router.routes());

  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});
