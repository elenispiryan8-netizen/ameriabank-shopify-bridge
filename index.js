
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_TOKEN = process.env.SHOPIFY_TOKEN;
const AMERIA_CLIENT_ID = process.env.AMERIA_CLIENT_ID;
const AMERIA_USERNAME = process.env.AMERIA_USERNAME;
const AMERIA_PASSWORD = process.env.AMERIA_PASSWORD;
const BASE_URL = process.env.BASE_URL;

app.get("/", (req, res) => {
  res.send("Ameriabank Shopify Bridge is running");
});

app.get("/create-payment", async (req, res) => {
  try {
    const orderId = req.query.order_id;
    if (!orderId) return res.status(400).send("order_id missing");

    const orderResp = await axios.get(
      `https://${SHOPIFY_STORE}/admin/api/2024-01/orders/${orderId}.json`,
      { headers: { "X-Shopify-Access-Token": SHOPIFY_TOKEN } }
    );

    const order = orderResp.data.order;
    const amount = order.total_price;

    const payload = {
      ClientID: AMERIA_CLIENT_ID,
      Username: AMERIA_USERNAME,
      Password: AMERIA_PASSWORD,
      Amount: parseFloat(amount),
      OrderID: parseInt(orderId),
      Description: `Shopify Order ${orderId}`,
      BackURL: `${BASE_URL}/payment-return`
    };

    const ameriaResp = await axios.post(
      "https://servicestest.ameriabank.am/VPOS/api/VPOS/InitPayment",
      payload
    );

    if (ameriaResp.data.ResponseCode !== 1 && ameriaResp.data.ResponseCode !== "1") {
      return res.status(500).send("Ameriabank error: " + JSON.stringify(ameriaResp.data));
    }

    const paymentId = ameriaResp.data.PaymentID;
    const redirectUrl = `https://servicestest.ameriabank.am/VPOS/Payments/Pay?id=${paymentId}&lang=en`;
    res.redirect(redirectUrl);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send("Server error");
  }
});

app.get("/payment-return", async (req, res) => {
  try {
    const { paymentID, orderID } = req.query;

    const verifyPayload = {
      PaymentID: paymentID,
      Username: AMERIA_USERNAME,
      Password: AMERIA_PASSWORD
    };

    const verifyResp = await axios.post(
      "https://servicestest.ameriabank.am/VPOS/api/VPOS/GetPaymentDetails",
      verifyPayload
    );

    const details = verifyResp.data;

    if (details.ResponseCode === "00") {
      await axios.put(
        `https://${SHOPIFY_STORE}/admin/api/2024-01/orders/${orderID}.json`,
        {
          order: {
            id: orderID,
            tags: "Paid via Ameriabank",
            note: `PaymentID: ${paymentID}`
          }
        },
        { headers: { "X-Shopify-Access-Token": SHOPIFY_TOKEN } }
      );

      res.send("Payment successful. Order updated in Shopify.");
    } else {
      res.send("Payment not successful: " + details.ResponseCode);
    }
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send("Verification error");
  }
});

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
