const Firestore = require('@google-cloud/firestore');
const fetch = require('isomorphic-fetch');
const format = require('date-fns/format');
const parseString = require('xml2js').parseString;
const path = require('ramda/src/path');
const app = require('./app');
const sendMessageToSlack = require('./slack');

const firestore = new Firestore({
  projectId: `${process.env.PROJECT_NAME}`,
  keyFilename: `./${process.env.PROJECT_NAME}.json`,
  timestampsInSnapshots: true
});

const getSquarespaceOrder = orderId => {
  return fetch(`https://api.squarespace.com/1.0/commerce/orders/${orderId}`, {
    headers: {
      Authorization: `Bearer ${process.env.SQUARESPACE_TOKEN}`
    }
  }).then(res => {
    if (res.ok) {
      return res.json();
    }

    return Promise.reject({ res });
  });
};

const buildLineItems = order => {
  let lineItems = '';

  order.lineItems.forEach(item => {
    lineItems += `<item>
            <inventory_item>${item.sku}</inventory_item>
            <inventory_item_sku>${item.sku}</inventory_item_sku>
            <inventory_item_description>${item.productName}</inventory_item_description>
            <inventory_item_price>${item.unitPricePaid.value}</inventory_item_price>
            <inventory_item_qty>${item.quantity}</inventory_item_qty>
            <inventory_item_ext_price>${item.quantity * 100.0}</inventory_item_ext_price>
            <inventory_passthrough_01>non-related lv id</inventory_passthrough_01>
            <inventory_passthrough_02>non-related lv id</inventory_passthrough_02>
          </item>`;
  });

  return lineItems;
};

const buildXML = order => {
  const lineItems = buildLineItems(order);

  return `<?xml version="1.0" encoding="UTF-8"?>
  <toolkit>
    <submit_order>
      <order_info>
        <order_details>
          <order_status>Active</order_status>
          <order_date>${format(order.createdOn, 'YYYY-MM-DD')}</order_date>
          <order_number>LB-${order.id}</order_number>
          <order_source>Web</order_source>
          <order_type>Regular</order_type>
          <catalog_name>LB</catalog_name>
          <gift_order>False</gift_order>
          <allocate_inventory_now>TRUE</allocate_inventory_now>
        </order_details>
        <billing_contact>
          <billto_prefix></billto_prefix>
          <billto_first_name>${order.billingAddress.firstName}</billto_first_name>
          <billto_last_name>${order.billingAddress.lastName}</billto_last_name>
          <billto_suffix></billto_suffix>
          <billto_company_name></billto_company_name>
          <billto_address1>${order.billingAddress.address1}</billto_address1>
          <billto_address2>${order.billingAddress.address2 || ''}</billto_address2>
          <billto_address3></billto_address3>
          <billto_city>${order.billingAddress.city}</billto_city>
          <billto_state>${order.billingAddress.state}</billto_state>
          <billto_postal_code>${order.billingAddress.postalCode}</billto_postal_code>
          <billto_country>${order.billingAddress.countryCode}</billto_country>
          <billto_telephone_no>${order.billingAddress.phone}</billto_telephone_no>
          <billto_email>${order.customerEmail}</billto_email>
        </billing_contact>
        <shipping_contact>
          <shipto_prefix></shipto_prefix>
          <shipto_first_name>${order.shippingAddress.firstName}</shipto_first_name>
          <shipto_last_name>${order.shippingAddress.lastName}</shipto_last_name>
          <shipto_suffix></shipto_suffix>
          <shipto_company_name></shipto_company_name>
          <shipto_address1>${order.shippingAddress.address1}</shipto_address1>
          <shipto_address2>${order.shippingAddress.address2 || ''}</shipto_address2>
          <shipto_address3></shipto_address3>
          <shipto_city>${order.shippingAddress.city}</shipto_city>
          <shipto_state>${order.shippingAddress.state}</shipto_state>
          <shipto_postal_code>${order.shippingAddress.postalCode}</shipto_postal_code>
          <shipto_country>${order.shippingAddress.countryCode}</shipto_country>
          <shipto_telephone_no>${order.shippingAddress.phone}</shipto_telephone_no>
          <shipto_email>${order.customerEmail}</shipto_email>
        </shipping_contact>
        <billing_details>
          <sub_total>${order.subtotal.value}</sub_total>
          <shipping_handling>${order.shippingTotal.value}</shipping_handling>
          <sales_tax_total>${order.taxTotal.value}</sales_tax_total>
          <discount_total>${order.discountTotal.value}</discount_total>
          <grand_total>${order.grandTotal.value}</grand_total>
        </billing_details>>
        <shipping_details>
          <ship_method>DHL Global Mail SM Parcel Plus Ground Machinable</ship_method>
          <ship_options>
            <signature_requested>FALSE</signature_requested>
            <insurance_requested>FALSE</insurance_requested>
            <insurance_value>${order.subtotal.value}</insurance_value>
            <saturday_delivery_requested>TRUE</saturday_delivery_requested>
            <third_party_billing_requested>FALSE</third_party_billing_requested>
            <third_party_billing_account_no></third_party_billing_account_no>
            <third_party_billing_zip></third_party_billing_zip>
            <third_party_country>US</third_party_country>
            <general_description>Sale item</general_description>
            <content_description>Artwork</content_description>
          </ship_options>
        </shipping_details>
        <order_notes>
          <note>
            <note_type>shipping</note_type>
            <note_description>Please make sure to pack order well</note_description>
            <show_on_ps>True</show_on_ps>
          </note>
        </order_notes>
        <order_items>
          <total_line_items>${order.lineItems.length}</total_line_items>
          ${lineItems}
        </order_items>
      </order_info>
    </submit_order>
  </toolkit>`;
};

const submitOrderToLiteView = (xml, res, next) => {
  return fetch(
    `https://liteviewapi.imaginefulfillment.com/order/submit/${process.env.LITEVIEW_URL}`,
    {
      method: 'POST',
      headers: {
        appkey: `${process.env.LITEVIEW_KEY}`
      },
      body: xml
    }
  ).then(liteViewResponse => {
    if (liteViewResponse.ok) {
      return liteViewResponse
        .text()
        .then(info => {
          parseString(info, (err, result) => {
            console.log(`Trying to parse liteview response 1: ${err}`);
            console.log(`Trying to parse liteview response 2: ${result}`);
            if (err) return next(err);

            const orderDetails =
              result.toolkit.submit_order[0].order_information[0].order_details[0];
            const lvOrderNumber = orderDetails.ifs_order_number[0];
            const squarespaceOrderNumber = orderDetails.client_order_number[0];
            const document = firestore.doc(`orders/${lvOrderNumber}`);

            document.set({
              orderNumber: lvOrderNumber,
              squarespaceOrderNumber: squarespaceOrderNumber,
              shipStatus: 'pending'
            });

            sendMessageToSlack(
              JSON.stringify({
                text: 'Successful order :tada:',
                attachments: [
                  {
                    title: 'Order Information',
                    fields: [
                      {
                        title: 'LV Order Number',
                        value: `${lvOrderNumber}`,
                        short: true
                      },
                      {
                        title: 'Squarespace Order Number',
                        value: `${squarespaceOrderNumber}`,
                        short: true
                      }
                    ]
                  }
                ]
              })
            );

            return res.status(200).json({
              orderNumber: lvOrderNumber,
              squarespaceOrderNumber: squarespaceOrderNumber,
              shipStatus: 'pending'
            });
          });
        })
        .catch(err => {
          sendMessageToSlack(
            JSON.stringify({
              text: `within liteview ok response\n${err}`
            })
          );

          return res.status(500).send({
            error: err
          });
        });
    }

    return liteViewResponse.text().then(errors => {
      sendMessageToSlack(
        JSON.stringify({
          text: `Liteview error response: \n ${errors}`
        })
      );
      return Promise.reject({ errors });
    });
  });
};

const onlyNBAProducts = lineitem => lineitem.productName.includes('NBA');

app.get('/api/submit', (req, res) => {
  res.status(200).json({ literally: 'ballin' });
});

app.post('/api/submit', (req, res, next) => {
  const id = path(['body', 'data', 'object', 'metadata', 'id'], req);

  if (!id) {
    sendMessageToSlack(
      JSON.stringify({
        text: `No stripe id found: ${JSON.stringify(req.body)}`
      })
    );

    return res.status(500).send({
      error: 'No stripe id found',
      data: req.body
    });
  }

  getSquarespaceOrder(id)
    .then(data => {
      console.log(`After SQ order request is successful: ${JSON.stringify(data)}`);

      const nbaProducts = Object.assign({}, data, {
        lineItems: data.lineItems.filter(onlyNBAProducts)
      });

      if (nbaProducts.lineItems.length > 0) {
        const xml = buildXML(nbaProducts);
        return submitOrderToLiteView(xml, res, next);
      } else {
        res.status(200).send({ nbaProducts });
      }
    })
    .catch(err => {
      console.log(`After SQ order fails: ${JSON.stringify(err)}`);
      sendMessageToSlack(JSON.stringify({ text: err }));
      res.status(500).send({ err });
    });
});
