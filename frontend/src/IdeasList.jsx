import React, { useState, useEffect } from 'react';
import Notification from './Notification';
import ReactMarkdown from 'react-markdown';

const BACKEND_URL = 'https://roka-agent-backend-684535434104.us-central1.run.app'; // <-- CORRECTED
const AUTH_HEADER = { 'Authorization': 'Basic YWRtaW46cGFzc3dvcmRAMTIz' };
const AUTH_JSON_HEADER = { ...AUTH_HEADER, 'Content-Type': 'application/json' };

const DownloadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
    <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/>
    <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/>
  </svg>
);

const IdeaCard = ({ idea }) => {
  const getStatusInfo = (approved) => {
    if (approved === true) return { text: 'Approved', className: 'approved' };
    if (approved === false) return { text: 'Rejected', className: 'rejected' };
    return { text: 'Submitted', className: 'submitted' };
  };
  const getUrgencyInfo = (urgency) => {
    const u = (urgency || "").toLowerCase();
    if (u === 'high') return { text: 'High', className: 'high' };
    if (u === 'medium') return { text: 'Medium', className: 'medium' };
    return { text: 'Low', className: 'low' };
  };

  const status = getStatusInfo(idea.approved);
  const urgency = getUrgencyInfo(idea.urgency);

  return (
    <div className="idea-card">
      <div className={`idea-card-sidebar ${status.className}`}></div>
      <div className="idea-card-main">
        <div className="idea-card-header">
        <span className="idea-icon">💡</span>
          <h3 className="idea-title">{idea.idea_title}</h3>
          <div className="idea-card-meta">
            <span className={`urgency-badge ${urgency.className}`}>{urgency.text}</span>
            <span className={`status-badge ${status.className}`}>{status.text}</span>
          </div>
        </div>
        <div className="idea-card-content">
          <p className="idea-explanation">{idea.explanation}</p>
          <div className="idea-details-grid">
            <div className="detail-item">
              <strong>Category</strong>
              <span>{idea.category}</span>
            </div>
            <div className="detail-item">
              <strong>Impact</strong>
              <span>{idea.expected_impact || 'N/A'}</span>
            </div>
            <div className="detail-item">
              <strong>Cost</strong>
              <span>{idea.estimated_cost || 'N/A'}</span>
            </div>
          </div>
        </div>
        <div className="idea-card-footer">
          <span>Submitted by: <strong>{idea.created_by}</strong></span>
          <span>{new Date(idea.submitted_at).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
};

export function IdeasList({ isReviewerMode, userId, onBack }) {
  const [ideas, setIdeas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [sortOrder, setSortOrder] = useState('date-desc');
  const [reviewingIdea, setReviewingIdea] = useState(null);
  const [reviewerNotes, setReviewerNotes] = useState('');
  const [notification, setNotification] = useState('');
  const [selectedIdeas, setSelectedIdeas] = useState([]);
  const [isComparing, setIsComparing] = useState(false);
  const [comparisonResult, setComparisonResult] = useState(null);

  const fetchIdeasAndAttachments = async () => {
    setLoading(true);
    try {
      const ideasResponse = await fetch(`${BACKEND_URL}/ideas`, { headers: AUTH_HEADER });
      if (!ideasResponse.ok) {
        throw new Error(`Failed to fetch ideas. Status: ${ideasResponse.status}`);
      }
      let fetchedIdeas = await ideasResponse.json();

      if (isReviewerMode && fetchedIdeas.length > 0) {
        const attachmentPromises = fetchedIdeas.map(idea =>
          fetch(`${BACKEND_URL}/session/${idea.session_id}`, { headers: AUTH_HEADER })
            .then(res => {
              if (res.ok) return res.json();
              console.warn(`Could not fetch history for session ${idea.session_id}`);
              return [];
            })
            .then(history => {
              const imageUrls = history
                .filter(msg => msg.file_url && /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(msg.file_url))
                .map(msg => msg.file_url);
              return { ...idea, image_urls: imageUrls };
            })
        );
        fetchedIdeas = await Promise.all(attachmentPromises);
      }
      
      setIdeas(fetchedIdeas);

    } catch (error)      {
      console.error('Error during data fetching:', error);
      setNotification('An error occurred while fetching the list of ideas.');
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    fetchIdeasAndAttachments();
  }, [isReviewerMode]);

  const handleReviewSubmit = async () => {
    if (!reviewingIdea) return;
    if (!reviewerNotes) {
      setNotification("A reviewer note is required to approve or reject an idea.");
      return;
    }
    try {
      const response = await fetch(`${BACKEND_URL}/submit-idea`, {
        method: 'POST',
        headers: AUTH_JSON_HEADER,
        body: JSON.stringify({
          idea_id: reviewingIdea.id,
          approved: reviewingIdea.approved,
          reviewer_notes: reviewerNotes
        })
      });

      if (response.ok) {
        setNotification(`Idea successfully ${reviewingIdea.approved ? 'approved' : 'rejected'}.`);
        setReviewingIdea(null);
        setReviewerNotes('');
        fetchIdeasAndAttachments(); 
      } else {
        const errorData = await response.json();
        setNotification(`Failed to update idea: ${errorData.error}`);
      }
    } catch (error) {
      setNotification('An error occurred while submitting the review.');
    }
  };

  const handleDownload = async (imageUrl) => {
    setNotification('Preparing download...');
    try {
      const response = await fetch(imageUrl);
      if (!response.ok) throw new Error('Network response was not ok');
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      const url = new URL(imageUrl);
      const filename = url.pathname.split('/').pop();
      link.download = filename || 'downloaded-image.jpg';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      setNotification('');
    } catch (error) {
      console.error('Download failed:', error);
      setNotification('Failed to download the image.');
    }
  };

  const handleIdeaSelect = (ideaId) => {
    setSelectedIdeas(prevSelected => {
      if (prevSelected.includes(ideaId)) {
        return prevSelected.filter(id => id !== ideaId);
      }
      if (prevSelected.length < 2) {
        return [...prevSelected, ideaId];
      }
      setNotification("You can only select up to 2 ideas to compare.");
      return prevSelected;
    });
  };

  const handleCompareIdeas = async () => {
    if (selectedIdeas.length !== 2) {
      setNotification("Please select exactly two ideas to compare.");
      return;
    }
    setIsComparing(true);
    setComparisonResult(null);
    try {
      const idea1 = ideas.find(i => i.id === selectedIdeas[0]);
      const idea2 = ideas.find(i => i.id === selectedIdeas[1]);
      
      const response = await fetch(`${BACKEND_URL}/compare-ideas`, {
        method: 'POST',
        headers: AUTH_JSON_HEADER,
        body: JSON.stringify({ idea1, idea2 })
      });
      
      const result = await response.json();
      if (response.ok) {
        setComparisonResult(result);
      } else {
        throw new Error(result.error || 'Failed to get comparison from server.');
      }
    } catch (error) {
      console.error('Error comparing ideas:', error);
      setNotification(`Comparison failed: ${error.message}`);
    } finally {
      setIsComparing(false);
    }
  };

  const filteredAndSortedIdeas = ideas
    .filter(idea => {
      if (!isReviewerMode && idea.approved !== true) {
        return false;
      }
      const searchLower = searchTerm.toLowerCase();
      const titleMatch = idea.idea_title.toLowerCase().includes(searchLower);
      const contributorMatch = idea.created_by && idea.created_by.toLowerCase().includes(searchLower);
      const categoryMatch = categoryFilter === 'All' || (idea.category && idea.category.toLowerCase() === categoryFilter.toLowerCase());
      return (titleMatch || contributorMatch) && categoryMatch;
    })
    .sort((a, b) => {
      if (sortOrder === 'date-desc') return new Date(b.submitted_at) - new Date(a.submitted_at);
      if (sortOrder === 'date-asc') return new Date(a.submitted_at) - new Date(b.submitted_at);
      if (sortOrder === 'urgency') {
        const order = { high: 3, medium: 2, low: 1 };
        const urgencyA = (a.urgency || "").toLowerCase();
        const urgencyB = (b.urgency || "").toLowerCase();
        return (order[urgencyB] || 0) - (order[urgencyA] || 0);
      }
      return 0;
    });

  return (
    <div className="dashboard-container">
      <Notification message={notification} onClose={() => setNotification('')} />

      <div className="dashboard-header">
        <h1>{isReviewerMode ? 'Idea Reviewer Dashboard' : 'Explore Ideas Submitted'}</h1>
        <button className="back-button logout-button" onClick={onBack}>{isReviewerMode ? 'Logout' : 'Back to Menu'}</button>
      </div>
      
      <div className="filters">
        <input type="text" placeholder="Search ideas..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="All">All Categories</option>
          <option value="Kitchen">Kitchen</option>
          <option value="Housekeeping">Housekeeping</option>
          <option value="Operations">Operations</option>
          <option value="Maintenance">Maintenance</option>
        </select>
        <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
          <option value="date-desc">Newest First</option>
          <option value="date-asc">Oldest First</option>
          <option value="urgency">By Urgency</option>
        </select>
      </div>

      {isReviewerMode && (
        <div className="compare-actions">
          <button
            className="action-button"
            onClick={handleCompareIdeas}
            disabled={selectedIdeas.length !== 2 || isComparing}
          >
            {isComparing ? 'Comparing...' : 'Compare 2 Selected Ideas'}
          </button>
          {selectedIdeas.length > 0 && (
            <button className="clear-selection-btn" onClick={() => setSelectedIdeas([])}>
              Clear Selection
            </button>
          )}
        </div>
      )}

      {loading ? <p className="loading-state">Loading ideas...</p> : (
        isReviewerMode ? (
          <div className="table-wrapper">
            <table className="idea-table">
              <thead>
                <tr>
                  <th className="col-select"></th>
                  <th className="col-contributor">Contributor</th>
                  <th className="col-idea">Idea Proposal</th>
                  <th className="col-details">Details</th>
                  <th className="col-submitted">Submitted</th>
                  <th className="col-attachments">Attachments</th>
                  <th className="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAndSortedIdeas.length > 0 ? (
                  filteredAndSortedIdeas.map((idea) => (
                    <tr key={idea.id}>
                      <td className="col-select">
                        <input
                          type="checkbox"
                          checked={selectedIdeas.includes(idea.id)}
                          onChange={() => handleIdeaSelect(idea.id)}
                          disabled={selectedIdeas.length >= 2 && !selectedIdeas.includes(idea.id)}
                        />
                      </td>
                      <td className="col-contributor">{idea.created_by}</td>
                      <td className="col-idea">
                        <div className="idea-cell-motive"><strong>Motive:</strong> {idea.idea_title}</div>
                        <div className="idea-cell-solution"><strong>Solution:</strong> {idea.explanation}</div>
                      </td>
                      <td className="col-details">
                        <div className="details-cell">
                          <div><strong>Category:</strong> {idea.category}</div>
                          <div><strong>Urgency:</strong> {idea.urgency}</div>
                          <div><strong>Impact:</strong> {idea.expected_impact || 'N/A'}</div>
                          <div><strong>Cost:</strong> {idea.estimated_cost || 'N/A'}</div>
                        </div>
                      </td>
                      <td className="col-submitted">{new Date(idea.submitted_at).toLocaleDateString()}</td>
                      <td className="col-attachments">
                        {idea.image_urls && idea.image_urls.length > 0 ? (
                          <div className="attachment-links">
                            {idea.image_urls.map((url, index) => (
                              <button key={index} className="download-button" title={`Download Image ${index + 1}`} onClick={() => handleDownload(url)}>
                                <DownloadIcon />
                              </button>
                            ))}
                          </div>
                        ) : ( '—' )}
                      </td>
                      <td className="col-actions">
                        <div className="actions-cell">
                          <div className="reviewer-note-display">
                            <strong>Note:</strong> {idea.reviewer_notes || '—'}
                          </div>
                          <div className="action-buttons-container">
                            {idea.approved === null || idea.approved === undefined ? (
                              <div className="action-buttons">
                                <button className="approve-btn" onClick={() => setReviewingIdea({ ...idea, approved: true })}>Approve</button>
                                <button className="reject-btn" onClick={() => setReviewingIdea({ ...idea, approved: false })}>Reject</button>
                              </div>
                            ) : (
                              <span className={`status-text ${idea.approved ? 'approved' : 'rejected'}`}>
                                {idea.approved ? 'Approved' : 'Rejected'}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan="7" style={{ textAlign: 'center' }}>No ideas found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="ideas-grid">
            {filteredAndSortedIdeas.length > 0 ? (
              filteredAndSortedIdeas.map(idea => <IdeaCard key={idea.id} idea={idea} />)
            ) : <p className="no-ideas-message">No approved ideas found.</p>}
          </div>
        )
      )}

      {reviewingIdea && (
        <div className="modal-overlay">
          <div className="modal review-modal">
            <h3>{reviewingIdea.approved ? 'Approve' : 'Reject'} Idea #{reviewingIdea.id}</h3>
            <div className="modal-content">
              <label htmlFor="reviewerNotes">Add Reviewer Note (Required):</label>
              <textarea 
                id="reviewerNotes"
                value={reviewerNotes} 
                onChange={(e) => setReviewerNotes(e.target.value)} 
                rows="4" 
              />
            </div>
            <div className="modal-actions">
              <button className="cancel-btn" onClick={() => setReviewingIdea(null)}>Cancel</button>
              <button 
                className={reviewingIdea.approved ? 'approve-btn' : 'reject-btn'} 
                onClick={handleReviewSubmit}
              >
                Submit {reviewingIdea.approved ? 'Approval' : 'Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {comparisonResult && (
        <div className="modal-overlay">
          <div className="modal review-modal comparison-modal">
            <h3>Comparison: {comparisonResult.idea1_title} vs. {comparisonResult.idea2_title}</h3>
            <div className="modal-content">
              <div className="comparison-text">
                <ReactMarkdown>{comparisonResult.comparison}</ReactMarkdown>
              </div>
            </div>
            <div className="modal-actions">
              <button 
                className="action-button"
                onClick={() => setComparisonResult(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}