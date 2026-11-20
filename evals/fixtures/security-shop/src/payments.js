// Card payments go through Stripe; the secret key comes from the environment.
export const stripeKey = () => process.env.STRIPE_SECRET_KEY;
