# Litview

This is a small Node app I made for a [friends](https://www.literallyballing.com/) Squarespace site, for their [NBA collaboration](https://www.literallyballing.com/nba). This app listens for an `order.created` webhook fired by Stripe when an order is made on their Squarespace site. It then takes the JSON payload and transforms it into an XML payload that can be sent to [Liteview](https://liteviewapi.imaginefulfillment.com/) for fullfillments.

Deployed on Google App Engine, built with Node, and uses Firestore to track orders.

Thought this might be helpful for any other devs that have to deal with the Liteview API.
