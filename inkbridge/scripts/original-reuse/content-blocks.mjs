export async function mergeContentBlockTranslations(pageProps){
  const response=await fetch('/_next/static/inkbridge-content-block-locales.json');
  if(!response.ok)throw Error('Missing prepared Tabs/Callout language resources');
  const locales=await response.json(),store=pageProps.pageProps?._nextI18Next?.initialI18nStore;
  if(!store)throw Error('Native editor translation provider missing');
  for(const [locale,resources]of Object.entries(locales))if(store[locale]?.common){
    store[locale].common.lexical={...store[locale].common.lexical,...resources.lexical};
  }
}
