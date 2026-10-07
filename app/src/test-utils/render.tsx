import { renderRouter } from 'expo-router/testing-library';

/**
 * Renders the whole app at `url`. With RNTL 14, render is async and renderRouter attaches its
 * route helpers to the returned promise, so keep the promise around to ask for the pathname.
 */
export async function renderApp(url: string) {
  const view = renderRouter('./src/app', { initialUrl: url });
  await view;
  return { pathname: () => view.getPathname(), params: () => view.getSearchParams() };
}
