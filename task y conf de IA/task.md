# WhatsApp & SMS Delivery Integration Task List

## 1. Twilio Client Configuration
- [/] Install the `twilio` npm package.
- [/] Add the following environment variables to `.env.local` and Vercel:
  - `TWILIO_ACCOUNT_SID`
  - `TWILIO_AUTH_TOKEN`
  - `TWILIO_PHONE_NUMBER` (For SMS)
  - `TWILIO_WHATSAPP_NUMBER` (For WhatsApp)
- [/] Create [src/infrastructure/twilio/client.ts](file:///c:/Users/pikachu/Downloads/saasresto/web/src/infrastructure/twilio/client.ts) with helper functions to send SMS and WhatsApp messages.

## 2. Queue Processing Service
- [x] Create a service function [processAnnouncementDeliveries()](file:///c:/Users/pikachu/Downloads/saasresto/web/src/modules/announcements/services/deliveries.ts#5-112) in [src/modules/announcements/services/deliveries.ts](file:///c:/Users/pikachu/Downloads/saasresto/web/src/modules/announcements/services/deliveries.ts).
- [x] Implement logic to:
  - Fetch `announcement_deliveries` with `status = 'queued'`.
  - Resolve the audience for each announcement to a list of employee phone numbers.
  - Send the message via Twilio (WhatsApp or SMS based on the `channel` field).
  - Update the delivery status to `sent` or `failed`.

## 3. Background Job / CRON Route
- [x] Create an internal API Route: [src/app/api/internal/cron/deliveries/route.ts](file:///c:/Users/pikachu/Downloads/saasresto/web/src/app/api/internal/cron/deliveries/route.ts).
- [x] Secure the route using a secret CRON key (e.g., `CRON_SECRET`).
- [x] Call the [processAnnouncementDeliveries()](file:///c:/Users/pikachu/Downloads/saasresto/web/src/modules/announcements/services/deliveries.ts#5-112) service inside the route.
- [x] Configure [vercel.json](file:///c:/Users/pikachu/Downloads/saasresto/web/vercel.json) to trigger this CRON route automatically (e.g., every 5 minutes).

## 4. UI Adjustments (Optional/Verification)
- [x] Ensure the modal options for WhatsApp and SMS reflect their active status (remove placeholders if any).
- [x] Add a visual indicator in the admin dashboard if a delivery failed.

## 5. Scaling Plan (Future - Meta Cloud API)
- [ ] Document the future transition from Twilio WhatsApp to Meta Cloud API to save costs.
