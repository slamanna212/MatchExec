import React from 'react';
import { Card, CardBody, Button } from '@heroui/react';

function NotFoundPage() {
  return (
    <div className="text-center">
      <h1 className="text-4xl font-bold text-white mb-4">404 - Page Not Found</h1>
      <Card className="max-w-md mx-auto">
        <CardBody>
          <p className="text-white/70 mb-4">The page you're looking for doesn't exist.</p>
          <Button color="primary" onClick={() => window.history.back()}>
            Go Back
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}

export default NotFoundPage; 