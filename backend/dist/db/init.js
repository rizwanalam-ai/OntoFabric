import 'dotenv/config';
import neo4j from 'neo4j-driver';
const uri = process.env.NEO4J_URI ?? 'bolt://localhost:7687';
const username = process.env.NEO4J_USERNAME ?? process.env.NEO4J_USER ?? 'neo4j';
const password = process.env.NEO4J_PASSWORD ?? 'password';
const database = process.env.NEO4J_DATABASE ?? 'neo4j';
const driver = neo4j.driver(uri, neo4j.auth.basic(username, password));
try {
    await driver.verifyConnectivity();
    const session = driver.session({ database });
    try {
        await session.executeWrite(async (transaction) => {
            await transaction.run('CREATE INDEX entity_id IF NOT EXISTS FOR (n:Entity) ON (n.id)');
            await transaction.run('CREATE INDEX entity_temporal IF NOT EXISTS FOR (n:Entity) ON (n.validFrom, n.validTo, n.transactionFrom, n.transactionTo)');
            await transaction.run('CREATE INDEX relationship_id IF NOT EXISTS FOR ()-[r:RELATED_TO]-() ON (r.id)');
            await transaction.run('CREATE INDEX relationship_temporal IF NOT EXISTS FOR ()-[r:RELATED_TO]-() ON (r.validFrom, r.validTo, r.transactionFrom, r.transactionTo)');
            await transaction.run('CREATE CONSTRAINT pending_review_id IF NOT EXISTS FOR (p:PendingReview) REQUIRE p.pendingId IS UNIQUE');
            await transaction.run('CREATE INDEX pending_review_status IF NOT EXISTS FOR (p:PendingReview) ON (p.status)');
            await transaction.run('CREATE CONSTRAINT sop_product_id IF NOT EXISTS FOR (n:Product) REQUIRE n.id IS UNIQUE');
            await transaction.run('CREATE CONSTRAINT sop_component_id IF NOT EXISTS FOR (n:Component) REQUIRE n.id IS UNIQUE');
            await transaction.run('CREATE CONSTRAINT sop_facility_id IF NOT EXISTS FOR (n:Facility) REQUIRE n.id IS UNIQUE');
            await transaction.run('CREATE CONSTRAINT sop_work_center_id IF NOT EXISTS FOR (n:WorkCenter) REQUIRE n.id IS UNIQUE');
            await transaction.run('CREATE CONSTRAINT sop_supplier_id IF NOT EXISTS FOR (n:Supplier) REQUIRE n.id IS UNIQUE');
            await transaction.run('CREATE CONSTRAINT sop_customer_id IF NOT EXISTS FOR (n:Customer) REQUIRE n.id IS UNIQUE');
            await transaction.run('CREATE CONSTRAINT sop_forecast_id IF NOT EXISTS FOR (n:DemandForecast) REQUIRE n.id IS UNIQUE');
            await transaction.run('CREATE INDEX sop_label IF NOT EXISTS FOR (n:Entity) ON (n.sopLabel)');
            await transaction.run('CREATE INDEX product_sku IF NOT EXISTS FOR (p:Product) ON (p.sku)');
            await transaction.run('CREATE INDEX demand_period IF NOT EXISTS FOR (d:DemandForecast) ON (d.period)');
        });
    }
    finally {
        await session.close();
    }
    console.log(`Neo4j database initialized: ${database}`);
}
finally {
    await driver.close();
}
//# sourceMappingURL=init.js.map