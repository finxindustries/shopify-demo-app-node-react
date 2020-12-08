import Head from 'next/head';
import { createHttpLink } from 'apollo-link-http';
import { InMemoryCache } from 'apollo-cache-inmemory';
import { AppProvider } from '@shopify/polaris';
import { Provider } from '@shopify/app-bridge-react';
import '@shopify/polaris/dist/styles.css';
import translations from '@shopify/polaris/locales/en.json';
import createApp from '@shopify/app-bridge';
import { ApolloClient } from 'apollo-client';
import { ApolloProvider } from '@apollo/react-hooks';
import { authenticatedFetch } from '@shopify/app-bridge-utils';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import ClientRouter from '../components/ClientRouter';

export default function MyApp({ Component, pageProps }) {
  const router = useRouter();
  const [shop, setShop] = useState(null);

  useEffect(() => {
    if (router.asPath !== router.route) {
      setShop(router.query.shop);
    }
  }, [router]);

  if (!shop) return null;

  const app = createApp({
    apiKey: API_KEY,
    shopOrigin: shop,
    forceRedirect: true,
  });
  const link = new createHttpLink({
    credentials: "omit",
    fetch: authenticatedFetch(app),
  });
  const client = new ApolloClient({
    link: link,
    cache: new InMemoryCache(),
  });
  const config = { apiKey: API_KEY, shopOrigin: shop, forceRedirect: true };
  return (
    <React.Fragment>
      <Head>
        <title>Sample App</title>
        <meta charSet="utf-8" />
      </Head>
      <Provider config={config}>
        <ClientRouter />
        <AppProvider i18n={translations}>
          <ApolloProvider client={client}>
            <Component {...pageProps} />
          </ApolloProvider>
        </AppProvider>
      </Provider>
    </React.Fragment>
  );
}
