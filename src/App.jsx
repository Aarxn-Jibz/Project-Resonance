import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import Lab from './pages/Lab';
import Library from './pages/Library';
import Chaos from './pages/Chaos';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/lab" element={<Lab />} />
        <Route path="/library" element={<Library />} />
        <Route path="/chaos" element={<Chaos />} />
      </Routes>
    </Router>
  );
}

export default App;