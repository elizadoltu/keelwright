# Project idea: support assistant

An assistant for our 12-person customer support team. An agent asks it a question in plain language and it answers from our help-centre articles (about 400 Markdown files, updated weekly), with links to the articles it used.

It can also look up an order's status through our existing orders REST API, and it can prepare a refund — but a refund is only made after a support agent approves it.

Questions often include customer names, emails and order details; we're in the EU. Answers should come back within a few seconds. Our engineering team writes Python. It runs as a small web service that our existing support tool calls.
