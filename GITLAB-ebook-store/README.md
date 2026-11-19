# GITLAB — Ebook storefront

A lightweight, responsive, no-registration digital storefront for Vercel. It includes two sample forex journal products and a Safaricom Daraja production STK Push API route.

## Important payment notes

- The browser never receives your Daraja secrets. Credentials belong in Vercel Environment Variables.
- This starter uses `CustomerBuyGoodsOnline`, your Buy Goods till as both BusinessShortCode and PartyB, and Kenyan phone format `2547XXXXXXXX`.
- The callback currently acknowledges and logs Safaricom's payment result. It does **not** save orders, verify delivery eligibility, or automatically deliver files. Add persistent order storage and a secure fulfilment flow before taking real customer orders.
- STK request accepted does not mean payment completed. The customer must approve the prompt and Safaricom must send a successful callback.
- Your till must be enabled by Safaricom for the relevant Lipa Na M-Pesa Online Buy Goods STK transaction type.

## Deploy to Vercel

1. Extract this ZIP.
2. Open https://vercel.com and sign in.
3. Choose **Add New → Project → Upload** (or import a GitHub repository containing these files).
4. Deploy with the default settings. No build command is required.
5. Open the project → **Settings → Environment Variables** and add the variables below. Select Production (and Preview if you want preview deployments to use M-Pesa).
6. Redeploy after adding or changing environment variables.

## Required Vercel environment variables

| Name | Value |
|---|---|
| `MPESA_CONSUMER_KEY` | Your Daraja production consumer key |
| `MPESA_CONSUMER_SECRET` | Your Daraja production consumer secret |
| `MPESA_SHORTCODE` | `1745713` |
| `MPESA_PASSKEY` | Your production Lipa Na M-Pesa Online passkey |
| `MPESA_CALLBACK_URL` | `https://YOUR-VERCEL-DOMAIN/api/mpesa-callback` |

Use the actual deployed Vercel domain in `MPESA_CALLBACK_URL`, then redeploy. Register/allow that public HTTPS callback URL in your Daraja setup if required by Safaricom.

## Test

1. Open the deployed site.
2. Choose one forex journal.
3. Enter a Safaricom number as 9 digits after +254, for example `712345678`.
4. Click **Send M-Pesa prompt**.
5. Approve the prompt on the phone and enter the M-Pesa PIN.
6. Check Vercel → Project → Logs for the callback result.

Sample prices are KSh 150 and KSh 200. Change the amounts and product descriptions in both `app.js` and `api/stk.js` if you edit the catalogue.

## Troubleshooting

- **M-Pesa authentication failed:** confirm production Consumer Key and Consumer Secret belong to the same Daraja app.
- **Invalid PartyA:** phone must be `2547XXXXXXXX`, with no plus sign, spaces, or leading zero.
- **Invalid BusinessShortCode / transaction type:** confirm Safaricom has enabled Buy Goods STK for till `1745713` and that the production passkey corresponds to the shortcode.
- **Callback not received:** confirm the callback URL is public HTTPS, correct, and the deployment has been redeployed.
- Never put Daraja secrets in `index.html`, `app.js`, GitHub, or any browser-side code.
