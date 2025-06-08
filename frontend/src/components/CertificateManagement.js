import React, { useState, useEffect } from 'react';
import './CertificateManagement.css';

const CertificateManagement = () => {
  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCertificate, setSelectedCertificate] = useState(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [certificateToDelete, setCertificateToDelete] = useState(null);

  // Form state for certificate upload
  const [uploadForm, setUploadForm] = useState({
    certificate: '',
    name: '',
    description: ''
  });

  // Form state for certificate generation
  const [generateForm, setGenerateForm] = useState({
    commonName: 'localhost',
    organization: 'TykBasic',
    organizationalUnit: 'Test Department',
    locality: 'Test City',
    state: 'Test State',
    country: 'US',
    validityDays: 365
  });

  const [generating, setGenerating] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);

  useEffect(() => {
    fetchCertificates();
  }, []);

  const fetchCertificates = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const token = localStorage.getItem('token');
      const response = await fetch('/api/tyk/certificates', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('🔍 Certificates response:', data);

      // Handle Tyk API response format: { "certs": ["cert1", "cert2", ...] }
      let certificateList = [];
      if (data.success && data.data) {
        if (data.data.certs && Array.isArray(data.data.certs)) {
          // Tyk returns certificate IDs in a "certs" array
          certificateList = data.data.certs.map(certId => ({
            id: certId,
            // We'll need to fetch details for each certificate separately
            // For now, just show the ID
            subject: 'Click "View Details" to load certificate info',
            issuer: 'Loading...',
            validFrom: null,
            validTo: null
          }));
        } else if (Array.isArray(data.data)) {
          // Direct array format
          certificateList = data.data;
        }
      }

      setCertificates(certificateList);
    } catch (err) {
      console.error('❌ Error fetching certificates:', err);
      setError(`Failed to fetch certificates: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const uploadCertificate = async () => {
    try {
      setError(null);
      
      if (!uploadForm.certificate.trim()) {
        setError('Certificate PEM data is required');
        return;
      }

      const token = localStorage.getItem('token');
      const response = await fetch('/api/tyk/certificates', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(uploadForm)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      setSuccess('Certificate uploaded successfully!');
      setShowUploadModal(false);
      setUploadForm({ certificate: '', name: '', description: '' });
      fetchCertificates();

    } catch (err) {
      console.error('❌ Error uploading certificate:', err);
      setError(`Failed to upload certificate: ${err.message}`);
    }
  };

  const deleteCertificate = async (certId) => {
    try {
      setError(null);
      
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/tyk/certificates/${certId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      setSuccess('Certificate deleted successfully!');
      setShowDeleteModal(false);
      setCertificateToDelete(null);
      fetchCertificates();

    } catch (err) {
      console.error('❌ Error deleting certificate:', err);
      setError(`Failed to delete certificate: ${err.message}`);
    }
  };

  const generateTestCertificate = async () => {
    try {
      setGenerating(true);
      setError(null);

      // Call backend to generate a real certificate
      const token = localStorage.getItem('token');
      const response = await fetch('/api/tyk/certificates/generate', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(generateForm)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      
      // Auto-fill the upload form with the generated certificate
      setUploadForm({
        certificate: result.certificate,
        name: `Generated Test Certificate - ${generateForm.commonName}`,
        description: `Self-signed test certificate for ${generateForm.commonName}, valid for ${generateForm.validityDays} days`
      });
      
      setShowGenerateModal(false);
      setShowUploadModal(true);
      setSuccess('Valid test certificate generated! Review and upload below.');

    } catch (err) {
      console.error('❌ Error generating certificate:', err);
      setError(`Failed to generate certificate: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const filteredCertificates = certificates.filter(cert => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      (cert.id && cert.id.toLowerCase().includes(searchLower)) ||
      (cert.subject && formatCertificateField(cert.subject).toLowerCase().includes(searchLower)) ||
      (cert.issuer && formatCertificateField(cert.issuer).toLowerCase().includes(searchLower)) ||
      (cert.fingerprint && cert.fingerprint.toLowerCase().includes(searchLower))
    );
  });

  const fetchCertificateDetails = async (certId) => {
    try {
      setLoadingDetails(true);
      setError(null);
      
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/tyk/certificates/${certId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('🔍 Certificate details response:', data);
      
      // Add detailed logging of certificate structure
      if (data.success && data.data) {
        console.log('📋 Certificate data structure:', {
          subject: data.data.subject,
          issuer: data.data.issuer,
          not_before: data.data.not_before,
          not_after: data.data.not_after,
          allKeys: Object.keys(data.data)
        });
      }

      // Return the certificate details from Tyk API
      if (data.success && data.data) {
        return {
          id: certId,
          ...data.data
        };
      }

      return {
        id: certId,
        subject: 'Unable to load certificate details',
        issuer: 'Error loading data',
        fingerprint: 'N/A'
      };

    } catch (err) {
      console.error('❌ Error fetching certificate details:', err);
      setError(`Failed to fetch certificate details: ${err.message}`);
      return {
        id: certId,
        subject: 'Error loading details',
        issuer: 'Failed to load',
        fingerprint: 'N/A'
      };
    } finally {
      setLoadingDetails(false);
    }
  };

  const formatCertificateField = (field) => {
    if (!field) return 'N/A';
    
    // If it's already a string, return it
    if (typeof field === 'string') return field;
    
    // If it's an array, handle it appropriately
    if (Array.isArray(field)) {
      // Skip complex nested arrays like "Names" to avoid clutter
      return `[${field.length} items]`;
    }
    
    // If it's an object, format it as a readable string
    if (typeof field === 'object') {
      const parts = [];
      
      // Common certificate field order for readability
      const fieldOrder = [
        'CommonName', 'Organization', 'OrganizationalUnit', 
        'Locality', 'Province', 'Country', 'SerialNumber'
      ];
      
      fieldOrder.forEach(key => {
        if (field[key] && !Array.isArray(field[key])) {
          parts.push(`${key}=${field[key]}`);
        }
      });
      
      // Add any remaining simple fields (skip arrays and complex objects)
      Object.keys(field).forEach(key => {
        if (!fieldOrder.includes(key) && field[key] && 
            typeof field[key] !== 'object' && !Array.isArray(field[key])) {
          parts.push(`${key}=${field[key]}`);
        }
      });
      
      return parts.length > 0 ? parts.join(', ') : 'N/A';
    }
    
    return String(field);
  };

  const formatCertificateDate = (dateValue) => {
    if (!dateValue) return 'N/A';
    
    try {
      let date;
      
      // Try different date formats
      if (typeof dateValue === 'number') {
        // Try as Unix timestamp (seconds)
        date = new Date(dateValue * 1000);
        
        // If that doesn't work, try as milliseconds
        if (date.getTime() < 0 || date.getFullYear() < 1970 || date.getFullYear() > 2100) {
          date = new Date(dateValue);
        }
      } else if (typeof dateValue === 'string') {
        // Try parsing as string
        date = new Date(dateValue);
      } else {
        return 'Invalid date format';
      }
      
      // Check if date is valid
      if (isNaN(date.getTime())) {
        return `Invalid date (${dateValue})`;
      }
      
      return date.toLocaleString();
    } catch (error) {
      return `Date error (${dateValue})`;
    }
  };

  const clearMessages = () => {
    setError(null);
    setSuccess(null);
  };

  return (
    <div className="certificate-management">
      <div className="certificate-header">
        <h2>Certificate Management</h2>
        <div className="certificate-actions">
          <button 
            className="btn btn-secondary"
            onClick={() => setShowGenerateModal(true)}
          >
            🔧 Generate Test Certificate
          </button>
          <button 
            className="btn btn-primary"
            onClick={() => setShowUploadModal(true)}
          >
            📤 Upload Certificate
          </button>
          <button 
            className="btn btn-outline"
            onClick={fetchCertificates}
            disabled={loading}
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-error">
          <span>❌ {error}</span>
          <button onClick={clearMessages} className="alert-close">×</button>
        </div>
      )}

      {success && (
        <div className="alert alert-success">
          <span>✅ {success}</span>
          <button onClick={clearMessages} className="alert-close">×</button>
        </div>
      )}

      <div className="certificate-filters">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search certificates by ID, subject, or issuer..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
      </div>

      {loading ? (
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Loading certificates...</p>
        </div>
      ) : (
        <div className="certificates-container">
          {filteredCertificates.length === 0 ? (
            <div className="empty-state">
              <h3>No certificates found</h3>
              <p>Upload your first certificate or generate a test certificate to get started.</p>
              <button 
                className="btn btn-primary"
                onClick={() => setShowUploadModal(true)}
              >
                Upload Certificate
              </button>
            </div>
          ) : (
            <div className="certificates-grid">
              {filteredCertificates.map((cert) => (
                <div key={cert.id} className="certificate-card">
                  <div className="certificate-info">
                    <h4>Certificate ID</h4>
                    <p className="cert-id">{cert.id}</p>
                    
                    {cert.subject && (
                      <>
                        <h4>Subject</h4>
                        <p>{formatCertificateField(cert.subject)}</p>
                      </>
                    )}
                    
                    {cert.issuer && (
                      <>
                        <h4>Issuer</h4>
                        <p>{formatCertificateField(cert.issuer)}</p>
                      </>
                    )}
                    
                    {cert.fingerprint && (
                      <>
                        <h4>Fingerprint</h4>
                        <p className="fingerprint">{cert.fingerprint}</p>
                      </>
                    )}
                  </div>
                  
                  <div className="certificate-actions">
                    <button
                      className="btn btn-small btn-outline"
                      onClick={async () => {
                        // Fetch detailed certificate information from Tyk API
                        const detailedCert = await fetchCertificateDetails(cert.id);
                        setSelectedCertificate(detailedCert);
                        setShowDetailsModal(true);
                      }}
                      disabled={loadingDetails}
                    >
                      {loadingDetails ? '⏳ Loading...' : '👁️ View Details'}
                    </button>
                    <button
                      className="btn btn-small btn-danger"
                      onClick={() => {
                        setCertificateToDelete(cert);
                        setShowDeleteModal(true);
                      }}
                    >
                      🗑️ Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Generate Certificate Modal */}
      {showGenerateModal && (
        <div className="modal-overlay" onClick={() => setShowGenerateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Generate Test Certificate</h3>
              <button 
                className="modal-close"
                onClick={() => setShowGenerateModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <p>This will generate a sample self-signed certificate for testing purposes.</p>
              <div className="form-group">
                <label>Common Name (CN)</label>
                <input
                  type="text"
                  value={generateForm.commonName}
                  onChange={(e) => setGenerateForm({ ...generateForm, commonName: e.target.value })}
                  placeholder="localhost"
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Organization</label>
                  <input
                    type="text"
                    value={generateForm.organization}
                    onChange={(e) => setGenerateForm({ ...generateForm, organization: e.target.value })}
                    placeholder="TykBasic"
                  />
                </div>
                <div className="form-group">
                  <label>Validity (Days)</label>
                  <input
                    type="number"
                    value={generateForm.validityDays}
                    onChange={(e) => setGenerateForm({ ...generateForm, validityDays: parseInt(e.target.value) })}
                    min="1"
                    max="3650"
                  />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="btn btn-secondary"
                onClick={() => setShowGenerateModal(false)}
              >
                Cancel
              </button>
              <button 
                className="btn btn-primary"
                onClick={generateTestCertificate}
                disabled={generating}
              >
                {generating ? '🔧 Generating...' : '🔧 Generate Certificate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Certificate Modal */}
      {showUploadModal && (
        <div className="modal-overlay" onClick={() => setShowUploadModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Upload Certificate</h3>
              <button 
                className="modal-close"
                onClick={() => setShowUploadModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Certificate Name (Optional)</label>
                <input
                  type="text"
                  value={uploadForm.name}
                  onChange={(e) => setUploadForm({ ...uploadForm, name: e.target.value })}
                  placeholder="Enter a name for this certificate"
                />
              </div>
              <div className="form-group">
                <label>Description (Optional)</label>
                <input
                  type="text"
                  value={uploadForm.description}
                  onChange={(e) => setUploadForm({ ...uploadForm, description: e.target.value })}
                  placeholder="Brief description of certificate usage"
                />
              </div>
              <div className="form-group">
                <label>Certificate PEM Data *</label>
                <textarea
                  value={uploadForm.certificate}
                  onChange={(e) => setUploadForm({ ...uploadForm, certificate: e.target.value })}
                  placeholder="Paste your PEM encoded certificate here&#10;-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
                  rows="10"
                  required
                />
              </div>
              <div className="upload-help">
                <p><strong>Tips:</strong></p>
                <ul>
                  <li>Certificate must be in PEM format</li>
                  <li>Include the full certificate chain if needed</li>
                  <li>Private keys should be uploaded separately and securely</li>
                </ul>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="btn btn-secondary"
                onClick={() => setShowUploadModal(false)}
              >
                Cancel
              </button>
              <button 
                className="btn btn-primary"
                onClick={uploadCertificate}
                disabled={!uploadForm.certificate.trim()}
              >
                📤 Upload Certificate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Certificate Details Modal */}
      {showDetailsModal && selectedCertificate && (
        <div className="modal-overlay" onClick={() => setShowDetailsModal(false)}>
          <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Certificate Details</h3>
              <button 
                className="modal-close"
                onClick={() => setShowDetailsModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="cert-details">
                <div className="detail-group">
                  <h4>Certificate ID</h4>
                  <p className="copyable">{selectedCertificate.id}</p>
                </div>
                
                {selectedCertificate.subject && (
                  <div className="detail-group">
                    <h4>Subject</h4>
                    <p>{formatCertificateField(selectedCertificate.subject)}</p>
                  </div>
                )}
                
                {selectedCertificate.issuer && (
                  <div className="detail-group">
                    <h4>Issuer</h4>
                    <p>{formatCertificateField(selectedCertificate.issuer)}</p>
                  </div>
                )}
                
                {selectedCertificate.fingerprint && (
                  <div className="detail-group">
                    <h4>Fingerprint</h4>
                    <p className="fingerprint">{selectedCertificate.fingerprint}</p>
                  </div>
                )}
                
                {selectedCertificate.not_before && (
                  <div className="detail-group">
                    <h4>Valid From</h4>
                    <p>{formatCertificateDate(selectedCertificate.not_before)}</p>
                  </div>
                )}
                
                {selectedCertificate.not_after && (
                  <div className="detail-group">
                    <h4>Valid Until</h4>
                    <p>{formatCertificateDate(selectedCertificate.not_after)}</p>
                  </div>
                )}
                
                {selectedCertificate.serial_number && (
                  <div className="detail-group">
                    <h4>Serial Number</h4>
                    <p className="serial-number">{selectedCertificate.serial_number}</p>
                  </div>
                )}
                
                {selectedCertificate.version && (
                  <div className="detail-group">
                    <h4>Version</h4>
                    <p>{selectedCertificate.version}</p>
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="btn btn-secondary"
                onClick={() => setShowDetailsModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && certificateToDelete && (
        <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Delete Certificate</h3>
              <button 
                className="modal-close"
                onClick={() => setShowDeleteModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to delete this certificate?</p>
              <div className="cert-info">
                <strong>ID:</strong> {certificateToDelete.id}
                {certificateToDelete.subject && (
                  <>
                    <br />
                    <strong>Subject:</strong> {formatCertificateField(certificateToDelete.subject)}
                  </>
                )}
              </div>
              <div className="warning">
                <p>⚠️ <strong>Warning:</strong> This action cannot be undone. Any APIs or services using this certificate will be affected.</p>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="btn btn-secondary"
                onClick={() => setShowDeleteModal(false)}
              >
                Cancel
              </button>
              <button 
                className="btn btn-danger"
                onClick={() => deleteCertificate(certificateToDelete.id)}
              >
                🗑️ Delete Certificate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CertificateManagement; 