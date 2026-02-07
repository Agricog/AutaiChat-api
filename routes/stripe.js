import express from 'express';
import Stripe from 'stripe';
import { query } from '../db/database.js';

const router = express.Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// POST /api/stripe/create-checkout - Create Stripe Checkout session
router.post('/create-checkout', async (req, res) => {
  try {
    const customerId = req.session.customerId;
    if (!customerId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Get customer details
    const customerResult = await query(
      'SELECT id, name, email, stripe_customer_id FROM customers WHERE id = $1',
      [customerId]
    );

    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const customer = customerResult.rows[0];

    // Create or reuse Stripe customer
    let stripeCustomerId = customer.stripe_customer_id;
    if (!stripeCustomerId) {
      const stripeCustomer = await stripe.customers.create({
        email: customer.email,
        name: customer.name,
        metadata: { autoReplyCustomerId: String(customerId) }
      });
      stripeCustomerId = stripeCustomer.id;

      await query(
        'UPDATE customers SET stripe_customer_id = $1 WHERE id = $2',
        [stripeCustomerId, customerId]
      );
    }

    // Create Checkout session
    // £99/month subscription + £300 one-time setup fee = £399 first payment
    // Then £99/month ongoing
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: process.env.STRIPE_MONTHLY_PRICE_ID,
          quantity: 1,
        },
        {
          price: process.env.STRIPE_SETUP_PRICE_ID,
          quantity: 1,
        }
      ],
      success_url: `${process.env.API_URL}/api/stripe/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.API_URL}/api/dashboard/${customerId}`,
      metadata: {
        customerId: String(customerId)
      },
      subscription_data: {
        metadata: {
          customerId: String(customerId)
        }
      }
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Stripe checkout error:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// GET /api/stripe/success - Handle successful payment redirect
router.get('/success', async (req, res) => {
  try {
    const sessionId = req.query.session_id;
    if (!sessionId) {
      return res.redirect('/login');
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const customerId = parseInt(session.metadata.customerId);

    if (!customerId) {
      return res.redirect('/login');
    }

    // Update customer status immediately (webhook will also confirm)
    await query(
      `UPDATE customers 
       SET subscription_status = 'active',
           stripe_subscription_id = $1
       WHERE id = $2`,
      [session.subscription, customerId]
    );

    // Redirect to dashboard with success flag
    res.redirect(`/api/dashboard/${customerId}?payment=success`);
  } catch (error) {
    console.error('Stripe success handler error:', error);
    res.redirect('/login');
  }
});

// POST /api/stripe/create-portal - Customer billing portal
router.post('/create-portal', async (req, res) => {
  try {
    const customerId = req.session.customerId;
    if (!customerId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const customerResult = await query(
      'SELECT stripe_customer_id FROM customers WHERE id = $1',
      [customerId]
    );

    if (!customerResult.rows[0]?.stripe_customer_id) {
      return res.status(400).json({ error: 'No billing account found' });
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerResult.rows[0].stripe_customer_id,
      return_url: `${process.env.API_URL}/api/dashboard/${customerId}`,
    });

    res.json({ url: portalSession.url });
  } catch (error) {
    console.error('Stripe portal error:', error);
    res.status(500).json({ error: 'Failed to create portal session' });
  }
});

export default router;
