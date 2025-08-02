import { Card, CardBody, CardHeader } from '@heroui/react';

export default function GamesPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Games</h1>
        <p className="text-default-500 mt-2">Manage available games and their configurations</p>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-xl font-semibold">Game Management</h2>
        </CardHeader>
        <CardBody>
          <p className="text-default-600">
            This page will contain game management features including:
          </p>
          <ul className="list-disc list-inside mt-4 space-y-2 text-default-600">
            <li>View all available games</li>
            <li>Configure game modes and maps</li>
            <li>Add new games to the system</li>
            <li>Edit game settings and metadata</li>
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}