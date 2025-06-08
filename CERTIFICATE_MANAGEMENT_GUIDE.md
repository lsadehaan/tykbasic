# 📜 Certificate Management Guide - TykBasic

## Overview

Certificate management in TykBasic enables secure API authentication using X.509 certificates instead of traditional API keys. This guide explains how certificates are used, managed, and integrated with Tyk Gateway.

## 🔐 Certificate Use Cases in Tyk Gateway

### 1. **Mutual TLS (mTLS) Authentication**
**Primary Use Case**: Authenticate API consumers using client certificates

- **How it works**: Clients present X.509 certificates to prove their identity
- **Security benefit**: Cryptographically strong authentication without shared secrets
- **Use case**: Enterprise API consumers, B2B integrations, microservices
- **Implementation**: Certificates stored in Tyk, referenced in API definitions

```json
{
  "use_mutual_tls": true,
  "client_certificates": ["cert-id-1", "cert-id-2"],
  "upstream_certificates": {
    "cert-id-3": "upstream-server-cert"
  }
}
```

### 2. **Upstream SSL Certificates**
**Purpose**: Secure connections to backend services

- **How it works**: Tyk presents certificates when connecting to HTTPS backends
- **Security benefit**: Validates backend service identity, prevents MITM attacks
- **Use case**: Connecting to secure internal services, third-party APIs
- **Implementation**: Certificates configured per API backend

### 3. **Certificate Authority (CA) Validation**
**Purpose**: Validate client certificates against trusted CAs

- **How it works**: Upload CA certificates to establish trust chains
- **Security benefit**: Only accept certificates from trusted issuers
- **Use case**: Enterprise environments with internal PKI
- **Implementation**: CA certificates stored separately, referenced in auth

### 4. **Certificate Pinning**
**Purpose**: Validate specific certificates for enhanced security

- **How it works**: Pin specific certificate fingerprints or public keys
- **Security benefit**: Prevents attacks using rogue certificates
- **Use case**: Critical integrations, high-security environments

## 📋 Certificate Requirements

### **Format Requirements**
✅ **X.509 Standard**: Must be valid X.509 certificates
✅ **PEM Encoding**: ASCII-armored format with proper headers
✅ **Valid Structure**: Proper ASN.1 DER encoding within PEM wrapper
✅ **Complete Chain**: Include intermediate certificates if needed

### **PEM Format Example**
```pem
-----BEGIN CERTIFICATE-----
MIIDXTCCAkWgAwIBAgIJAL7J9V2IQz7QMA0GCSqGSIb3DQEBCwUAMEUxCzAJBgNV
BAYTAlVTMRMwEQYDVQQIDApTb21lLVN0YXRlMSEwHwYDVQQKDBhJbnRlcm5ldCBX
aWRnaXRzIFB0eSBMdGQwHhcNMjUwNjA4MTQzMDAwWhcNMjYwNjA4MTQzMDAwWjBF
MQswCQYDVQQGEwJVUzETMBEGA1UECAwKU29tZS1TdGF0ZTEhMB8GA1UECgwYSW50
ZXJuZXQgV2lkZ2l0cyBQdHkgTHRkMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIB
CgKCAQEA2X4V9Y2nH8J4Q1j1a5K2b3C4v5d6E7f8G9h0I1j2K3l4M5n6O7p8Q9r0
S1t2U3v4W5x6Y7z8A9b0C1d2E3f4G5h6I7j8K9l0M1n2O3p4Q5r6S7t8U9v0W1x2
Y3z4A5b6C7d8E9f0G1h2I3j4K5l6M7n8O9p0Q1r2S3t4U5v6W7x8Y9z0A1b2C3d4
E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0U1v2W3x4Y5z6A7b8C9d0E1f2G3h4I5j6
K7l8M9n0O1p2Q3r4S5t6U7v8W9x0Y1z2A3b4C5d6E7f8G9h0I1j2K3l4M5n6O7p8
QIDAQABMA0GCSqGSIb3DQEBCwUAA4IBAQC1p2R3t4U5v6W7x8Y9z0A1b2C3d4E5
f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0U1v2W3x4Y5z6A7b8C9d0E1f2G3h4I5j6K7
-----END CERTIFICATE-----
```

### **Validation Checks**
1. **Format Validation**: Proper PEM headers and base64 encoding
2. **X.509 Structure**: Valid certificate structure and fields
3. **Date Validation**: Not before/not after dates are valid
4. **Signature Verification**: Certificate signature is valid
5. **Key Usage**: Appropriate extensions for intended purpose

### **Common Certificate Errors**
❌ **Malformed Certificate**: Invalid PEM format or structure
❌ **Expired Certificate**: Past expiration date
❌ **Invalid Signature**: Certificate signature verification failed
❌ **Missing Intermediate**: Incomplete certificate chain
❌ **Wrong Key Usage**: Certificate not suitable for intended use

## 🛠️ TykBasic Certificate Management Features

### **Upload Certificates**
- **Source**: Upload existing certificates from files or paste PEM data
- **Validation**: Automatic format and structure validation
- **Metadata**: Add names and descriptions for organization
- **Storage**: Certificates stored securely in Tyk Gateway

### **Generate Test Certificates**
- **Self-Signed**: Generate valid self-signed certificates for testing
- **Customizable**: Configure subject details (CN, O, OU, L, ST, C)
- **Validity Period**: Set expiration dates (default 365 days)
- **Real X.509**: Generates actual valid certificates, not samples

### **Certificate Management**
- **List View**: Browse all uploaded certificates
- **Search & Filter**: Find certificates by ID, subject, or issuer
- **Details View**: Inspect certificate properties and metadata
- **Delete**: Remove certificates no longer needed

### **Integration with APIs**
- **API Configuration**: Reference certificates in API definitions
- **mTLS Setup**: Enable mutual TLS authentication
- **Upstream SSL**: Configure backend certificate validation
- **Access Control**: Grant certificate-based access to APIs

## 🔧 Certificate Generation Options

### **Self-Signed Certificates** (For Testing)
- **Purpose**: Development and testing environments
- **Security**: Not suitable for production use
- **Generation**: Built-in certificate generator in TykBasic
- **Usage**: Testing mTLS flows, development APIs

### **CA-Signed Certificates** (For Production)
- **Purpose**: Production environments
- **Security**: Validated by trusted Certificate Authorities
- **Acquisition**: Purchase from commercial CAs or use internal PKI
- **Usage**: Production APIs, enterprise integrations

### **Certificate Generation Parameters**
```javascript
{
  "commonName": "api-client.example.com",        // Primary hostname/identifier
  "organization": "Example Corp",                // Organization name
  "organizationalUnit": "API Team",             // Department/unit
  "locality": "San Francisco",                  // City
  "state": "California",                        // State/province
  "country": "US",                              // Country (2-letter code)
  "validityDays": 365,                          // Certificate validity period
  "keySize": 2048                               // RSA key size (2048/4096)
}
```

## 🔗 API Integration Examples

### **Enable mTLS on API**
```json
{
  "name": "Secure API",
  "use_mutual_tls": true,
  "client_certificates": ["cert-abc123"],
  "strip_auth_data": false,
  "auth": {
    "auth_header_name": "",
    "use_certificate": true
  }
}
```

### **Certificate-Based Access Rights**
```json
{
  "access_rights": {
    "api-id": {
      "api_id": "api-id",
      "api_name": "Secure API",
      "versions": ["Default"],
      "certificate": "cert-abc123"
    }
  }
}
```

## 🔐 Security Best Practices

### **Certificate Security**
1. **Strong Key Sizes**: Use RSA 2048-bit minimum (4096-bit preferred)
2. **Short Validity**: Use shorter validity periods (1 year or less)
3. **Proper Storage**: Store private keys securely (HSM, key vaults)
4. **Access Control**: Limit certificate management to authorized users
5. **Audit Logging**: Track all certificate operations

### **Production Considerations**
1. **Certificate Rotation**: Plan for regular certificate renewal
2. **Backup Procedures**: Backup certificates and private keys securely
3. **Monitoring**: Monitor certificate expiration dates
4. **Revocation**: Plan for certificate revocation procedures
5. **Compliance**: Ensure certificates meet regulatory requirements

### **Testing Guidelines**
1. **Separate Environments**: Use different certificates for dev/test/prod
2. **Test Expiration**: Test certificate expiration handling
3. **Validation Testing**: Test certificate validation scenarios
4. **Error Handling**: Test invalid certificate handling

## 📊 Certificate Lifecycle Management

### **Certificate States**
- **Generated**: Newly created certificate
- **Uploaded**: Certificate added to Tyk Gateway
- **Active**: Certificate in use by APIs
- **Expiring**: Certificate approaching expiration
- **Expired**: Certificate past expiration date
- **Revoked**: Certificate marked as invalid

### **Automated Workflows** (Future Enhancement)
- **Expiration Monitoring**: Automated alerts for expiring certificates
- **Auto-Renewal**: Automatic certificate renewal for supported CAs
- **Health Checks**: Regular validation of certificate status
- **Compliance Reporting**: Certificate inventory and compliance reports

## 🚀 Getting Started

### **Step 1: Access Certificate Management**
1. Log in to TykBasic dashboard
2. Navigate to "📜 Certificates" tab
3. View existing certificates or upload new ones

### **Step 2: Generate Test Certificate**
1. Click "🔧 Generate Test Certificate"
2. Configure certificate parameters
3. Generate and review the certificate
4. Upload to Tyk Gateway

### **Step 3: Configure API for mTLS**
1. Create or edit an API definition
2. Enable "use_mutual_tls": true
3. Reference certificate ID in client_certificates array
4. Deploy changes to gateway

### **Step 4: Test Certificate Authentication**
1. Configure client with certificate and private key
2. Make API request with client certificate
3. Verify authentication success
4. Monitor certificate usage in logs

## 🔍 Troubleshooting

### **Common Issues**
- **"Malformed Certificate"**: Check PEM format and structure
- **"Certificate Expired"**: Verify certificate validity dates
- **"Authentication Failed"**: Check certificate configuration in API
- **"Certificate Not Found"**: Verify certificate was uploaded successfully

### **Debug Steps**
1. Validate certificate format with openssl
2. Check Tyk Gateway logs for detailed errors
3. Verify API configuration references correct certificate ID
4. Test certificate with curl or similar tools

## 📚 Related Documentation

- [Tyk Gateway Certificate Documentation](https://tyk.io/docs/security/certificates/)
- [mTLS Authentication Guide](https://tyk.io/docs/security/mutual-tls/)
- [X.509 Certificate Standards](https://tools.ietf.org/html/rfc5280)
- [TykBasic API Key Management](./API_KEY_MANAGEMENT_GUIDE.md)

---

This certificate management system provides enterprise-grade security for API authentication while maintaining ease of use for development and testing scenarios. 