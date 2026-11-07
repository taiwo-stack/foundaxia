import React, { useState, useEffect } from 'react';
import FormattedText, { stripFormatting } from '../components/FormattedText';
import { useNavigate, useLocation } from 'react-router-dom';
import { getCourses } from '../services/dataService';

// Local enrichment map: provides grades & skills metadata per course title
// (These aren't stored in the DB yet — they enrich the live DB records)
const courseEnrichment = {
  'Elementary Math':               { grades: ['K-5'], skills: ['Addition & Subtraction', 'Multiplication Tables', 'Fractions Intro', 'Word Problems'] },
  'Pre-Algebra':                   { grades: ['K-5', 'Middle School'], skills: ['Integers', 'Linear Equations', 'Ratios & Proportions', 'Exponents'] },
  'Algebra I & II':                { grades: ['Middle School', 'High School'], skills: ['Polynomials', 'Quadratic Formulas', 'Factoring', 'Systems of Equations'] },
  'Geometry':                      { grades: ['Middle School', 'High School'], skills: ['Coordinate Geometry', 'Congruence Proofs', 'Similarity', 'Trig Basics'] },
  'Trigonometry':                  { grades: ['High School'], skills: ['Unit Circle', 'Trig Identities', 'Sine & Cosine Laws', 'Wave Graphs'] },
  'Calculus':                      { grades: ['High School'], skills: ['Limits', 'Derivatives', 'Integrals', 'AP Calculus prep'] },
  'Phonics':                       { grades: ['K-5'], skills: ['Letter Sounds', 'Vowel Blends', 'Sight Words', 'Early Reading'] },
  'Reading Comprehension':         { grades: ['K-5', 'Middle School', 'High School'], skills: ['Text Analysis', 'Main Idea Finding', 'Inference Drawing', 'Vocabulary'] },
  'Creative Writing':              { grades: ['K-5', 'Middle School'], skills: ['Character Development', 'Plot Outlining', 'Dialogue Rules', 'Spelling'] },
  'Essay Writing':                 { grades: ['Middle School', 'High School'], skills: ['Thesis Statements', 'MLA/APA Citation', 'Persuasive Structure', 'Editing'] },
  'Literature':                    { grades: ['Middle School', 'High School'], skills: ['Classic Prose Analysis', 'Theme Tracking', 'Poetry Metrics', 'Motif Analysis'] },
  'Life Science':                  { grades: ['K-5', 'Middle School'], skills: ['Cell Structures', 'Ecosystems', 'Food Chains', 'Plant Biology'] },
  'Biology':                       { grades: ['Middle School', 'High School'], skills: ['Genetics', 'Photosynthesis', 'Evolution', 'Human Anatomy'] },
  'Chemistry':                     { grades: ['High School'], skills: ['Stoichiometry', 'Periodic Table', 'Chemical Bonding', 'Acid-Base Reactions'] },
  'Physics':                       { grades: ['High School'], skills: ['Mechanics & Forces', 'Electromagnetism', 'Wave Kinetics', 'Thermodynamics'] },
  'Earth Science':                 { grades: ['K-5', 'Middle School'], skills: ['Rock Cycle', 'Plate Tectonics', 'Weather & Climate', 'Solar Systems'] },
  'JAMB Prep':                     { grades: ['High School'], skills: ['Use of English', 'JAMB Past Questions', 'CBT Mock Drills', 'Subject Strategy'] },
  'WAEC Prep':                     { grades: ['High School'], skills: ['Practical Prep', 'Theory Explanations', 'WAEC Syllabi', 'Past Questions'] },
  'NECO Prep':                     { grades: ['High School'], skills: ['NECO Exam Pattern', 'Practical Guidelines', 'Mock Assessments', 'Confidence'] },
  'Post-UTME Prep':                { grades: ['High School'], skills: ['University Past Questions', 'Aptitude Tests', 'Speed Math', 'General Paper'] },
  'SAT Prep':                      { grades: ['High School'], skills: ['SAT Math Strategies', 'Reading Passages', 'Time Management', 'Practice Exams'] },
  'ACT Prep':                      { grades: ['High School'], skills: ['ACT Science Reasoning', 'Time Drills', 'ACT English Grammar', 'Math Shortcodes'] },
  'State Assessments':             { grades: ['K-5', 'Middle School', 'High School'], skills: ['Curriculum Mapping', 'Test Anxiety Relief', 'Question Formats', 'Confidence'] },
  'Spanish':                       { grades: ['K-5', 'Middle School', 'High School'], skills: ['Basic Vocabulary', 'Grammar Rules', 'Conversational Practice', 'Reading & Writing'] },
  'French':                        { grades: ['K-5', 'Middle School', 'High School'], skills: ['Pronunciation', 'French Grammar', 'Listening Comprehension', 'Writing Skills'] },
  'Intro to Coding':               { grades: ['K-5', 'Middle School'], skills: ['Scratch block logic', 'Sequencing', 'Loops intro', 'Conditionals'] },
  'Computer Science Fundamentals': { grades: ['Middle School', 'High School'], skills: ['Python / JS syntax', 'Algorithm Design', 'Data structures', 'Git basics'] },
};

export default function SubjectsPage() {
  const navigate = useNavigate();
  const location = useLocation();

  // DB-sourced courses state
  const [allCourses, setAllCourses] = useState([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [selectedGrades, setSelectedGrades] = useState([]);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  // Fetch courses from DB on mount, merge with enrichment map for grades/skills
  useEffect(() => {
    getCourses()
      .then(data => {
        const enriched = (data || []).map(course => {
          const name = course.title || course.name || '';
          const extra = courseEnrichment[name] || { grades: ['K-5', 'Middle School', 'High School'], skills: [] };
          return {
            id: course.id,
            name,
            category: course.category || 'General',
            description: course.description || '',
            grades: extra.grades,
            skills: extra.skills,
            image_url: course.image_url || '',
            course_type: course.course_type || 'regular'
          };
        });
        setAllCourses(enriched);
      })
      .catch(err => {
        console.error('Failed to load courses:', err);
      })
      .finally(() => setLoading(false));
  }, []);

  // Apply initialCategory / initialGrade from navigation state (e.g. from header dropdown filter)
  useEffect(() => {
    window.scrollTo(0, 0);
    if (location.state) {
      if (location.state.initialCategory) {
        setSelectedCategories([location.state.initialCategory]);
      }
      if (location.state.initialGrade) {
        setSelectedGrades([location.state.initialGrade]);
      }
    }
  }, [location.state]);

  // Handle category checkbox selection
  const handleCategoryChange = (category) => {
    setSelectedCategories(prev =>
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  // Handle grade checkbox selection
  const handleGradeChange = (grade) => {
    setSelectedGrades(prev =>
      prev.includes(grade)
        ? prev.filter(g => g !== grade)
        : [...prev, grade]
    );
  };

  // Reset all filters
  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedCategories([]);
    setSelectedGrades([]);
  };

  // Filtered list computed dynamically from DB-sourced courses
  const filteredSubjects = allCourses.filter(subject => {
    const matchesSearch =
      subject.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      stripFormatting(subject.description).toLowerCase().includes(searchQuery.toLowerCase()) ||
      subject.skills.some(s => s.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCategory =
      selectedCategories.length === 0 ||
      selectedCategories.includes(subject.category);

    const matchesGrade =
      selectedGrades.length === 0 ||
      subject.grades.some(g => selectedGrades.includes(g));

    return matchesSearch && matchesCategory && matchesGrade;
  });

  // Derive category list dynamically from DB data
  const categoryList = [...new Set(allCourses.map(c => c.category))].filter(Boolean);

  // Handle CTA redirection to LandingPage Booking Form
  const handleRequestTutor = (subjectName) => {
    navigate('/', {
      state: {
        openBooking: true,
        selectedSubject: subjectName
      }
    });
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#081730',
      color: 'white',
      paddingTop: '8rem',
      paddingBottom: '5rem',
      position: 'relative'
    }}>
      {/* Background Swoop overlay */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0,
        height: '400px',
        background: 'linear-gradient(180deg, rgba(242, 122, 36, 0.05) 0%, rgba(8, 23, 48, 0) 100%)',
        pointerEvents: 'none',
        zIndex: 1
      }} />

      {/* Glowing decorative background blobs */}
      <div style={{
        position: 'absolute',
        top: '8%', left: '4%',
        width: '320px', height: '320px',
        background: 'radial-gradient(circle, rgba(242, 122, 36, 0.12) 0%, rgba(242, 122, 36, 0) 70%)',
        filter: 'blur(50px)',
        pointerEvents: 'none',
        zIndex: 1
      }} />
      <div style={{
        position: 'absolute',
        bottom: '20%', right: '4%',
        width: '380px', height: '380px',
        background: 'radial-gradient(circle, rgba(15, 44, 89, 0.35) 0%, rgba(15, 44, 89, 0) 70%)',
        filter: 'blur(70px)',
        pointerEvents: 'none',
        zIndex: 1
      }} />

      {/* Loading spinner while DB courses are being fetched */}
      {loading && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 50,
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          flexDirection: 'column', gap: '1rem'
        }}>
          <div style={{
            width: '48px', height: '48px',
            border: '4px solid rgba(255, 255, 255, 0.1)',
            borderTop: '4px solid var(--accent-color)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite'
          }} />
          <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.95rem' }}>Loading subjects...</p>
        </div>
      )}

      <div
        className="container"
        style={{
          position: 'relative', zIndex: 2,
          opacity: loading ? 0 : 1,
          transition: 'opacity 0.3s ease'
        }}
      >
        {/* Filter Drawer Backdrop Overlay inside container stacking context */}
        {mobileFilterOpen && (
          <div 
            className="filter-drawer-backdrop" 
            onClick={() => setMobileFilterOpen(false)} 
          />
        )}
        {/* Header Block */}
        <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
          <span style={{
            background: 'rgba(242, 122, 36, 0.15)',
            color: 'var(--accent-color)',
            padding: '0.4rem 1.1rem',
            borderRadius: '50px',
            fontSize: '0.82rem',
            fontWeight: '700',
            textTransform: 'uppercase',
            letterSpacing: '1.2px',
            display: 'inline-block',
            marginBottom: '1rem',
            border: '1.5px solid rgba(242, 122, 36, 0.25)'
          }}>
            Explore Study Paths
          </span>
          <h1 style={{
            fontFamily: 'var(--font-heading)',
            fontSize: '3rem',
            fontWeight: '800',
            lineHeight: '1.2',
            marginBottom: '1.25rem'
          }}>
            Our Academic Subjects
          </h1>
          <p style={{
            color: 'rgba(255, 255, 255, 0.85)',
            fontSize: '1.15rem',
            maxWidth: '650px',
            margin: '0 auto',
            lineHeight: '1.6'
          }}>
            Filter, search, and discover learning map details across all K–12 grade levels and STEM categories.
          </p>
        </div>

        {/* Filter & Listing Layout Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '300px 1fr',
          gap: '3rem',
          alignItems: 'start'
        }} className="subjects-grid-layout">

          {/* Advanced Filter Panel (Sidebar) */}
          <div style={{
            background: 'rgba(11, 22, 44, 0.8)',
            border: '1.5px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '24px',
            padding: '2rem 1.75rem',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.15)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            position: 'sticky',
            top: '7.5rem'
          }} className={`filter-sidebar ${mobileFilterOpen ? 'open' : ''}`}>
            <div className="filter-sidebar-header">
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '800', fontFamily: 'var(--font-heading)', color: 'white' }}>Filters</h3>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <button onClick={handleResetFilters} className="filter-clear-link">
                  Clear All
                </button>
                <button className="filter-drawer-close-btn" onClick={() => setMobileFilterOpen(false)} aria-label="Close filters">
                  ✕
                </button>
              </div>
            </div>

            {/* Search */}
            <div style={{ marginBottom: '2rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.8px', color: 'rgba(255, 255, 255, 0.7)', marginBottom: '0.75rem' }}>
                Search Subjects
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  placeholder="e.g. Algebra, Scratch..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.8rem 2.2rem 0.8rem 1rem',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1.5px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '12px',
                    color: 'white',
                    fontSize: '0.9rem',
                    outline: 'none',
                    transition: 'border-color 0.2s',
                    boxSizing: 'border-box'
                  }}
                  onFocus={e => e.target.style.borderColor = 'var(--accent-color)'}
                  onBlur={e => e.target.style.borderColor = 'rgba(255, 255, 255, 0.12)'}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    style={{
                      position: 'absolute',
                      right: '0.75rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'transparent',
                      border: 'none',
                      color: 'rgba(255, 255, 255, 0.4)',
                      cursor: 'pointer',
                      fontSize: '1rem'
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            {/* Categories */}
            <div style={{ marginBottom: '2rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.8px', color: 'rgba(255, 255, 255, 0.7)', marginBottom: '0.8rem' }}>
                Categories
              </label>
              <div className="filter-checkbox-group">
                {(categoryList.length > 0
                  ? categoryList
                  : ['Math', 'English & Reading', 'Science', 'Test Prep', 'World Languages', 'Coding & Tech']
                ).map(category => {
                  const isChecked = selectedCategories.includes(category);
                  return (
                    <label key={category} className={`filter-label-chip ${isChecked ? 'active' : ''}`}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleCategoryChange(category)}
                      />
                      {category}
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Grade Level */}
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.8px', color: 'rgba(255, 255, 255, 0.7)', marginBottom: '0.8rem' }}>
                Grade Level
              </label>
              <div className="filter-checkbox-group">
                {['K-5', 'Middle School', 'High School'].map(grade => {
                  const isChecked = selectedGrades.includes(grade);
                  return (
                    <label key={grade} className={`filter-label-chip ${isChecked ? 'active' : ''}`}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleGradeChange(grade)}
                      />
                      {grade === 'K-5' ? 'Early Learners (K-5)' : grade}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Subject Cards Results List */}
          <div style={{ width: '100%' }}>
            {/* Results Count Banner */}
            <div className="results-count-banner">
              <div>Showing {filteredSubjects.length} subjects found</div>
              {(selectedCategories.length > 0 || selectedGrades.length > 0 || searchQuery) && (
                <div style={{ fontSize: '0.88rem', color: 'rgba(255, 255, 255, 0.5)' }}>Active filters apply</div>
              )}
            </div>

            {/* Active Filters Row (Current State) */}
            {(selectedCategories.length > 0 || selectedGrades.length > 0 || searchQuery) && (
              <div className="active-filters-chips-container">
                <span className="active-filters-label">Active Filters:</span>
                <div className="active-filters-chips-list">
                  {searchQuery && (
                    <span className="filter-active-chip" onClick={() => setSearchQuery('')}>
                      Search: "{searchQuery}" <span className="chip-close-icon">✕</span>
                    </span>
                  )}
                  {selectedCategories.map(cat => (
                    <span key={cat} className="filter-active-chip" onClick={() => handleCategoryChange(cat)}>
                      {cat} <span className="chip-close-icon">✕</span>
                    </span>
                  ))}
                  {selectedGrades.map(g => (
                    <span key={g} className="filter-active-chip" onClick={() => handleGradeChange(g)}>
                      {g === 'K-5' ? 'Early Learners' : g} <span className="chip-close-icon">✕</span>
                    </span>
                  ))}
                  <button className="active-filters-clear-btn" onClick={handleResetFilters}>
                    Clear All
                  </button>
                </div>
              </div>
            )}

            {/* Grid display or empty state */}
            {filteredSubjects.length === 0 ? (
              <div style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1.5px dashed rgba(255, 255, 255, 0.1)',
                borderRadius: '24px',
                padding: '4rem 2rem',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🔍</div>
                <h3 style={{ color: 'white', fontSize: '1.3rem', margin: '0 0 0.5rem 0' }}>No Matching Subjects</h3>
                <p style={{ color: 'rgba(255, 255, 255, 0.6)', maxWidth: '400px', margin: '0 auto 1.5rem', fontSize: '0.92rem' }}>
                  We couldn't find any subjects matching your search filters. Try adjusting your checkboxes or query.
                </p>
                <button
                  onClick={handleResetFilters}
                  style={{
                    padding: '0.6rem 1.8rem',
                    background: 'var(--accent-color)',
                    border: 'none',
                    borderRadius: '10px',
                    color: 'white',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  Reset All Filters
                </button>
              </div>
            ) : (
              <div className="subjects-grid">
                {filteredSubjects.map(subj => (
                  <div key={subj.id} className="subject-detail-card">
                    <div>
                      {/* Category badge + Grade chips */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                        <span className="subject-card-category">
                          {subj.category}
                        </span>
                        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          {subj.grades.map(g => {
                            let gradeClass = 'k-5';
                            if (g === 'Middle School') gradeClass = 'middle';
                            if (g === 'High School') gradeClass = 'high';
                            return (
                              <span key={g} className={`subject-card-grade-tag ${gradeClass}`}>
                                {g}
                              </span>
                            );
                          })}
                        </div>
                      </div>

                      {/* Title */}
                      <h3 className="subject-card-title">
                        {subj.name}
                      </h3>

                      {/* Description */}
                      <FormattedText className="subject-card-desc" text={subj.description} />

                      {/* Skills/Topics tags list */}
                      <div style={{ marginBottom: '2rem' }}>
                        <div className="subject-card-topics-title">
                          Key Topics:
                        </div>
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                          {subj.skills.map(s => (
                            <span key={s} className="subject-card-skill-tag">
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Action Button */}
                    <button
                      onClick={() => handleRequestTutor(subj.name)}
                      className="subject-card-button"
                    >
                      Request a Tutor
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sticky Mobile Filter Trigger Button */}
      <button 
        className="mobile-filter-floating-btn" 
        onClick={() => setMobileFilterOpen(true)}
        aria-label="Open filter drawer"
      >
        🔍 Filter &amp; Search {(selectedCategories.length + selectedGrades.length + (searchQuery ? 1 : 0)) > 0 ? `(${selectedCategories.length + selectedGrades.length + (searchQuery ? 1 : 0)})` : ''}
      </button>


    </div>
  );
}
