#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const OPENAPI_URL = 'https://ifd-001-prod-api.apps.ext-waf.spoke.prod.us-east-1.aws.paas.redhat.com/openapi.json';
const OUTPUT_FILE = path.join(__dirname, 'tmp-openapi-spec.json');

async function fetchOpenApiSpec() {
  try {
    console.log('Fetching OpenAPI spec from:', OPENAPI_URL);
    
    const response = await fetch(OPENAPI_URL);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const spec = await response.json();
    
    // Save to temporary file
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(spec, null, 2));
    
    console.log('OpenAPI spec downloaded successfully!');
    console.log('Saved to:', OUTPUT_FILE);
    console.log('Spec info:');
    console.log(`   - Title: ${spec.info?.title || 'N/A'}`);
    console.log(`   - Version: ${spec.info?.version || 'N/A'}`);
    console.log(`   - Paths: ${Object.keys(spec.paths || {}).length}`);
    
  } catch (error) {
    console.error('Error fetching OpenAPI spec:', error.message);
    process.exit(1);
  }
}

// Check if fetch is available (Node.js 18+)
if (typeof fetch === 'undefined') {
  console.error('This script requires Node.js 18+ with fetch support');
  console.log('Alternatively, install node-fetch: npm install node-fetch');
  process.exit(1);
}

fetchOpenApiSpec(); 