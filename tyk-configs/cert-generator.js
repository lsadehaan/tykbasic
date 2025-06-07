const forge = require('node-forge');

/**
 * Generate a self-signed certificate for testing
 * @param {Object} options - Certificate options
 * @returns {Object} Certificate and private key in PEM format
 */
function generateSelfSignedCert(options = {}) {
  const {
    commonName = 'test-server.local',
    organization = 'Test Organization',
    organizationalUnit = 'Test Unit',
    locality = 'Test City',
    state = 'Test State',
    country = 'US',
    validityDays = 365,
    keySize = 2048
  } = options;

  console.log(`🔐 Generating self-signed certificate for ${commonName}...`);

  // Generate a key pair
  const keys = forge.pki.rsa.generateKeyPair(keySize);
  
  // Create a certificate
  const cert = forge.pki.createCertificate();
  
  // Set certificate fields
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setDate(cert.validity.notBefore.getDate() + validityDays);
  
  // Set subject attributes
  cert.setSubject([
    { name: 'commonName', value: commonName },
    { name: 'organizationName', value: organization },
    { name: 'organizationalUnitName', value: organizationalUnit },
    { name: 'localityName', value: locality },
    { name: 'stateOrProvinceName', value: state },
    { name: 'countryName', value: country }
  ]);
  
  // Set issuer (same as subject for self-signed)
  cert.setIssuer(cert.subject.attributes);
  
  // Add extensions
  cert.setExtensions([
    {
      name: 'basicConstraints',
      cA: true
    },
    {
      name: 'keyUsage',
      keyCertSign: true,
      digitalSignature: true,
      nonRepudiation: true,
      keyEncipherment: true,
      dataEncipherment: true
    },
    {
      name: 'extKeyUsage',
      serverAuth: true,
      clientAuth: true,
      codeSigning: true,
      emailProtection: true,
      timeStamping: true
    },
    {
      name: 'nsCertType',
      server: true,
      client: true,
      email: true,
      objsign: true,
      sslCA: true,
      emailCA: true,
      objCA: true
    },
    {
      name: 'subjectAltName',
      altNames: [
        { type: 2, value: commonName },
        { type: 2, value: 'localhost' },
        { type: 7, ip: '127.0.0.1' },
        { type: 7, ip: '::1' }
      ]
    }
  ]);
  
  // Self-sign certificate
  cert.sign(keys.privateKey);
  
  // Convert to PEM format
  const certPem = forge.pki.certificateToPem(cert);
  const privateKeyPem = forge.pki.privateKeyToPem(keys.privateKey);
  const publicKeyPem = forge.pki.publicKeyToPem(keys.publicKey);
  
  console.log(`✅ Certificate generated successfully`);
  console.log(`   Valid from: ${cert.validity.notBefore}`);
  console.log(`   Valid to: ${cert.validity.notAfter}`);
  console.log(`   Serial: ${cert.serialNumber}`);
  
  return {
    certificate: certPem,
    privateKey: privateKeyPem,
    publicKey: publicKeyPem,
    fingerprint: forge.md.sha256.create().update(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes()).digest().toHex(),
    info: {
      commonName,
      organization,
      validFrom: cert.validity.notBefore,
      validTo: cert.validity.notAfter,
      serialNumber: cert.serialNumber
    }
  };
}

/**
 * Generate a certificate chain (root CA + server cert)
 * @param {Object} options - Certificate options
 * @returns {Object} Certificate chain in PEM format
 */
function generateCertificateChain(options = {}) {
  const {
    rootCN = 'Test Root CA',
    serverCN = 'test-server.local',
    validityDays = 365
  } = options;

  console.log(`🔐 Generating certificate chain (Root CA + Server Cert)...`);

  // Generate Root CA
  const rootKeys = forge.pki.rsa.generateKeyPair(2048);
  const rootCert = forge.pki.createCertificate();
  
  rootCert.publicKey = rootKeys.publicKey;
  rootCert.serialNumber = '01';
  rootCert.validity.notBefore = new Date();
  rootCert.validity.notAfter = new Date();
  rootCert.validity.notAfter.setDate(rootCert.validity.notBefore.getDate() + validityDays);
  
  rootCert.setSubject([
    { name: 'commonName', value: rootCN },
    { name: 'organizationName', value: 'Test Root Organization' },
    { name: 'countryName', value: 'US' }
  ]);
  rootCert.setIssuer(rootCert.subject.attributes);
  
  rootCert.setExtensions([
    { name: 'basicConstraints', cA: true },
    { name: 'keyUsage', keyCertSign: true, cRLSign: true }
  ]);
  
  rootCert.sign(rootKeys.privateKey);
  
  // Generate Server Certificate
  const serverKeys = forge.pki.rsa.generateKeyPair(2048);
  const serverCert = forge.pki.createCertificate();
  
  serverCert.publicKey = serverKeys.publicKey;
  serverCert.serialNumber = '02';
  serverCert.validity.notBefore = new Date();
  serverCert.validity.notAfter = new Date();
  serverCert.validity.notAfter.setDate(serverCert.validity.notBefore.getDate() + validityDays);
  
  serverCert.setSubject([
    { name: 'commonName', value: serverCN },
    { name: 'organizationName', value: 'Test Server Organization' },
    { name: 'countryName', value: 'US' }
  ]);
  serverCert.setIssuer(rootCert.subject.attributes);
  
  serverCert.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
    { name: 'extKeyUsage', serverAuth: true, clientAuth: true },
    {
      name: 'subjectAltName',
      altNames: [
        { type: 2, value: serverCN },
        { type: 2, value: 'localhost' },
        { type: 7, ip: '127.0.0.1' }
      ]
    }
  ]);
  
  // Sign server cert with root CA
  serverCert.sign(rootKeys.privateKey);
  
  const rootCertPem = forge.pki.certificateToPem(rootCert);
  const serverCertPem = forge.pki.certificateToPem(serverCert);
  const serverKeyPem = forge.pki.privateKeyToPem(serverKeys.privateKey);
  
  console.log(`✅ Certificate chain generated successfully`);
  
  return {
    rootCA: {
      certificate: rootCertPem,
      privateKey: forge.pki.privateKeyToPem(rootKeys.privateKey)
    },
    server: {
      certificate: serverCertPem,
      privateKey: serverKeyPem,
      fullChain: serverCertPem + rootCertPem
    },
    chain: serverCertPem + rootCertPem
  };
}

/**
 * Generate multiple test certificates for different scenarios
 */
function generateTestCertificates() {
  console.log('🏭 Generating test certificates for comprehensive testing...\n');

  const certificates = {};

  // 1. Basic self-signed certificate
  certificates.basic = generateSelfSignedCert({
    commonName: 'test-basic.local',
    organization: 'Basic Test Org'
  });

  console.log(''); // spacing

  // 2. Server certificate with multiple SANs
  certificates.multiSAN = generateSelfSignedCert({
    commonName: 'test-multi.local',
    organization: 'Multi SAN Test Org'
  });

  console.log(''); // spacing

  // 3. Certificate chain
  certificates.chain = generateCertificateChain({
    rootCN: 'Test Root CA',
    serverCN: 'test-chain.local'
  });

  console.log(''); // spacing

  // 4. Short-lived certificate (for expiration testing)
  certificates.shortLived = generateSelfSignedCert({
    commonName: 'test-short.local',
    organization: 'Short Lived Test Org',
    validityDays: 1
  });

  return certificates;
}

module.exports = {
  generateSelfSignedCert,
  generateCertificateChain,
  generateTestCertificates
};

// If run directly, generate test certificates
if (require.main === module) {
  const certs = generateTestCertificates();
  
  console.log('\n📋 Generated Certificates Summary:');
  console.log(`   Basic Certificate: ${certs.basic.info.commonName}`);
  console.log(`   Multi-SAN Certificate: ${certs.multiSAN.info.commonName}`);
  console.log(`   Certificate Chain: ${certs.chain.server.certificate.includes('BEGIN CERTIFICATE') ? 'Generated' : 'Failed'}`);
  console.log(`   Short-lived Certificate: ${certs.shortLived.info.commonName}`);
  
  console.log('\n💡 Certificates are ready for testing!');
} 