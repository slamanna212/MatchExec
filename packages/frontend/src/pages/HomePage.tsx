import React from 'react';
import { Card, CardBody, Button } from '@heroui/react';

function HomePage() {
  return (
    <div className="fade-in">
      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-6xl font-bold text-white mb-4">
          Welcome to MatchExec
        </h1>
        <p className="text-xl text-white/70 max-w-2xl mx-auto">
          Multi-game match execution and statistics platform supporting Overwatch 2 and Marvel Rivals
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
        <Card className="glass">
          <CardBody className="p-6">
            <h3 className="text-2xl font-semibold text-white mb-3">Overwatch 2</h3>
            <p className="text-white/70 mb-4">
              Track matches, analyze performance, and manage team statistics for Overwatch 2.
            </p>
            <Button color="primary" className="w-full">
              View Overwatch Stats
            </Button>
          </CardBody>
        </Card>

        <Card className="glass">
          <CardBody className="p-6">
            <h3 className="text-2xl font-semibold text-white mb-3">Marvel Rivals</h3>
            <p className="text-white/70 mb-4">
              Monitor matches, track hero performance, and analyze team dynamics in Marvel Rivals.
            </p>
            <Button color="secondary" className="w-full">
              View Marvel Rivals Stats
            </Button>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

export default HomePage; 