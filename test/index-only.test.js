var should = require('./init.js');

var db, Customer, Vendor, Deal;

describe('index-only model', function() {

    before(function(done) {
        db = getSchema();
        Customer = db.define('Customer');
        Vendor = db.define('Vendor');
        Deal = db.define('Deal', null, {
            delegatedIndexes: {
                // z:Customer:Deal-vendorId:x of customerId
                // to query Customer.all({where: {'Deal-vendorId': x}}
                vendorId: {
                    model: 'Customer',
                    key: 'customerId'
                },
                // z:Vendor:Deal-customerId:x of vendorId
                // to query Vendor.all({where: {'Deal-customerId': x}}
                customerId: {
                    model: 'Vendor',
                    key: 'vendorId'
                }
            }
        });

        Vendor.destroyAll(function() {
            Customer.destroyAll(function() {
                Deal.destroyAll(done);
            });
        });
    });

    it('should be declared', function() {
        Customer.hasAndBelongsToMany('vendors', {through: Deal});
        Vendor.hasAndBelongsToMany('customers', {through: Deal});
    });

    it('should allow to create instances on scope', function(done) {
        Customer.create(function(e, customer) {
            customer.vendors.create({name: 'popular'}, function(e, t) {
                t.should.be.an.instanceOf(Vendor);
                Deal.findOne(function(e, deal) {
                    should.exist(deal);
                    deal.vendorId.should.equal(t.id);
                    deal.customerId.should.equal(customer.id);
                    done();
                });
            });
        });
    });

    it('should allow to fetch scoped instances', function(done) {
        Customer.findOne(function(e, customer) {
            customer.vendors(function(e, vendors) {
                should.not.exist(e);
                should.exist(vendors);
                done();
            });
        });
    });

    it('should allow to add connection with instance', function(done) {
        Customer.findOne(function(e, customer) {
            Vendor.create({name: 'awesome'}, function(e, tag) {
                customer.vendors.add(tag, function(e, deal) {
                    should.not.exist(e);
                    should.exist(deal);
                    deal.should.be.an.instanceOf(Deal);
                    deal.vendorId.should.equal(tag.id);
                    deal.customerId.should.equal(customer.id);
                    done();
                });
            });
        });
    });

    it('should allow to remove connection with instance', function(done) {
        Customer.findOne(function(e, customer) {
            customer.vendors(function(e, vendors) {
                var len = vendors.length;
                vendors.should.not.be.empty;
                customer.vendors.remove(vendors[0], function(e) {
                    should.not.exist(e);
                    customer.vendors(true, function(e, vendors) {
                        vendors.should.have.lengthOf(len - 1);
                        done();
                    });
                });
            });
        });
    });

});
