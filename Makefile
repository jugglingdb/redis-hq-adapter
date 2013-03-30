## TESTS

TESTER = ./node_modules/.bin/mocha
OPTS = --require ./test/init.js --ignore-leaks --growl
TESTS = test/*.test.js

test:
	$(TESTER) $(OPTS) $(TESTS)
test-verbose:
	$(TESTER) $(OPTS) --reporter spec $(TESTS)
testing:
	$(TESTER) $(OPTS) --watch $(TESTS)

.PHONY: test docs
