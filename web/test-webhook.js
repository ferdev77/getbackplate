const fetch = require('node-fetch');

async function triggerWebhook() {
  const payload = {
    id: "evt_test123",
    type: "customer.subscription.created",
    data: {
      object: {
        id: "sub_test123",
        customer: "cus_test123",
        status: "active",
        metadata: {
          organizationId: "TEST_ORG_ID"
        },
        items: {
          data: [
            {
              price: { id: "price_12345" },
              quantity: 1
            }
          ]
        },
        current_period_start: 1700000000,
        current_period_end: 1700000000
      }
    }
  };

  try {
    const res = await fetch("http://localhost:3000/api/stripe/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Fake signature to bypass validation or it will fail
      },
      body: JSON.stringify(payload)
    });
    const text = await res.text();
    console.log("Status:", res.status);
    console.log("Response:", text);
  } catch (e) {
    console.error(e);
  }
}

triggerWebhook();
