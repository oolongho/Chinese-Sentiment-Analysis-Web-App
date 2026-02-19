import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import HomePage from './pages/HomePage';
import TextAnalysisPage from './pages/TextAnalysisPage';
import AudioAnalysisPage from './pages/AudioAnalysisPage';
import PerformancePage from './pages/PerformancePage';
import './App.css';

function App() {
  return (
    <Router>
      <div className="min-h-screen flex flex-col bg-white">
        <Header />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/text-analysis" element={<TextAnalysisPage />} />
            <Route path="/audio-analysis" element={<AudioAnalysisPage />} />
            <Route path="/performance" element={<PerformancePage />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </Router>
  );
}

export default App;
