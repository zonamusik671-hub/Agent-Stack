2contentscript.js:14083 ObjectMultiplex - orphaned data for stream "app-init-liveness"
warn @ contentscript.js:14083
2contentscript.js:14083 ObjectMultiplex - orphaned data for stream "background-liveness"
warn @ contentscript.js:14083
forward-logs-shared.ts:120 Download the React DevTools for a better development experience: https://react.dev/link/react-devtools
forward-logs-shared.ts:120 [HMR] connected
2forward-logs-shared.ts:120 Phantom was registered as a Standard Wallet. The Wallet Adapter for Phantom can be removed from your app.
(anonymous) @ forward-logs-shared.ts:120
react-dom-client.development.js:5524 Uncaught Error: Hydration failed because the server rendered HTML didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:

- A server/client branch `if (typeof window !== 'undefined')`.
- Variable input such as `Date.now()` or `Math.random()` which changes each time it's called.
- Date formatting in a user's locale which doesn't match the server.
- External changing data without sending a snapshot of it along with the HTML.
- Invalid HTML tag nesting.

It can also happen if the client has a browser extension installed which messes with the HTML before React loaded.

https://react.dev/link/hydration-mismatch

  ...
    <WalletProviderBase wallets={[...]} adapter={{_events:{}, ...}} isUnloadingRef={{current:false}} ...>
      <WalletModalProvider>
        <main className="min-h-scre...">
          <header className="sticky top...">
            <div className="mx-auto fl...">
              <div>
              <WalletConnect>
                <div className="mx-6 flex ...">
                  <WalletMultiButton className="!bg-emeral...">
                    <BaseWalletMultiButton className="!bg-emeral..." labels={{...}}>
                      <div className="wallet-ada...">
                        <BaseWalletConnectionButton className="!bg-emeral..." aria-expanded={false} style={{...}} ...>
                          <Button className="wallet-ada..." aria-expanded={false} style={{...}} ...>
                            <button className="wallet-ada..." disabled={undefined} style={{...}} ...>
+                             <i className="wallet-adapter-button-start-icon">
-                             Select Wallet
                              ...
                        ...
          ...

    at throwOnHydrationMismatch (react-dom-client.development.js:5524:11)
    at beginWork (react-dom-client.development.js:12397:17)
    at runWithFiberInDEV (react-dom-client.development.js:1027:30)
    at performUnitOfWork (react-dom-client.development.js:19065:22)
    at workLoopConcurrentByScheduler (react-dom-client.development.js:19059:9)
    at renderRootConcurrent (react-dom-client.development.js:19041:15)
    at performWorkOnRoot (react-dom-client.development.js:17896:11)
    at performWorkOnRootViaSchedulerTask (react-dom-client.development.js:20554:7)
    at MessagePort.performWorkUntilDeadline (scheduler.development.js:45:48)
(index):1 Access to XMLHttpRequest at 'https://prestocks.com/api/prestocks' from origin 'http://localhost:3000' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.
prestocks.com/api/prestocks:1  Failed to load resource: net::ERR_FAILED
(index):1 Access to XMLHttpRequest at 'https://hermes.pyth.network/api/latest_price_feeds?ids%5B%5D=f9c017263a506240646467c9d2833076137d076d000000000000000000000001&binary=true' from origin 'http://localhost:3000' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.
hermes.pyth.network/api/latest_price_feeds?ids%5B%5D=f9c017263a506240646467c9d2833076137d076d000000000000000000000001&binary=true:1  Failed to load resource: net::ERR_FAILED
pyth?id=0x49f6b6f3f742145b13689c6d0407e3768ba2f6c0294e77227e8d641147a27453:1  Failed to load resource: the server responded with a status of 502 (Bad Gateway)
pyth?id=0x49f6b6f3f742145b13689c6d0407e3768ba2f6c0294e77227e8d641147a27453:1  Failed to load resource: the server responded with a status of 502 (Bad Gateway)
(index):1 Access to XMLHttpRequest at 'https://hermes.pyth.network/api/latest_price_feeds?ids%5B%5D=f9c017263a506240646467c9d2833076137d076d000000000000000000000001&binary=true' from origin 'http://localhost:3000' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.
hermes.pyth.network/api/latest_price_feeds?ids%5B%5D=f9c017263a506240646467c9d2833076137d076d000000000000000000000001&binary=true:1  Failed to load resource: net::ERR_FAILED
(index):1 Access to XMLHttpRequest at 'https://hermes.pyth.network/api/latest_price_feeds?ids%5B%5D=f9c017263a506240646467c9d2833076137d076d000000000000000000000001&binary=true' from origin 'http://localhost:3000' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.
hermes.pyth.network/api/latest_price_feeds?ids%5B%5D=f9c017263a506240646467c9d2833076137d076d000000000000000000000001&binary=true:1  Failed to load resource: net::ERR_FAILED
(index):1 Access to XMLHttpRequest at 'https://hermes.pyth.network/api/latest_price_feeds?ids%5B%5D=f9c017263a506240646467c9d2833076137d076d000000000000000000000001&binary=true' from origin 'http://localhost:3000' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.
hermes.pyth.network/api/latest_price_feeds?ids%5B%5D=f9c017263a506240646467c9d2833076137d076d000000000000000000000001&binary=true:1  Failed to load resource: net::ERR_FAILED
RebalanceStatus.tsx:21  GET http://localhost:3000/api/pyth?id=0x49f6b6f3f742145b13689c6d0407e3768ba2f6c0294e77227e8d641147a27453 502 (Bad Gateway)
dispatchXhrRequest @ xhr.js:275
(anonymous) @ xhr.js:18
dispatchRequest @ dispatchRequest.js:54
_request @ Axios.js:242
request @ Axios.js:42
(anonymous) @ Axios.js:269
wrap @ bind.js:12
fetchPrice @ RebalanceStatus.tsx:21
RebalanceStatus.tsx:21  GET http://localhost:3000/api/pyth?id=0x49f6b6f3f742145b13689c6d0407e3768ba2f6c0294e77227e8d641147a27453 502 (Bad Gateway)
dispatchXhrRequest @ xhr.js:275
(anonymous) @ xhr.js:18
dispatchRequest @ dispatchRequest.js:54
_request @ Axios.js:242
request @ Axios.js:42
(anonymous) @ Axios.js:269
wrap @ bind.js:12
fetchPrice @ RebalanceStatus.tsx:21