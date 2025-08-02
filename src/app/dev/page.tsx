import { Card, CardBody, CardHeader, Chip } from '@heroui/react';

export default function DevPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Developer Tools</h1>
        <p className="text-default-500 mt-2">Development utilities and system information</p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader className="flex justify-between">
            <h2 className="text-xl font-semibold">System Status</h2>
            <Chip color="success" variant="flat">Online</Chip>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-small text-default-500">Database</p>
                <p className="font-semibold">SQLite Connected</p>
              </div>
              <div>
                <p className="text-small text-default-500">Discord Bot</p>
                <p className="font-semibold">Not Connected</p>
              </div>
              <div>
                <p className="text-small text-default-500">Scheduler</p>
                <p className="font-semibold">Running</p>
              </div>
              <div>
                <p className="text-small text-default-500">Worker</p>
                <p className="font-semibold">Running</p>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold">Database Tools</h2>
          </CardHeader>
          <CardBody>
            <p className="text-default-600 mb-4">
              Tools for database management and debugging.
            </p>
            <ul className="list-disc list-inside space-y-2 text-default-600">
              <li>View database schema</li>
              <li>Run SQL queries</li>
              <li>Manage data seeding</li>
              <li>Clear tournament data</li>
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold">Process Management</h2>
          </CardHeader>
          <CardBody>
            <p className="text-default-600 mb-4">
              Monitor and control PM2 processes.
            </p>
            <ul className="list-disc list-inside space-y-2 text-default-600">
              <li>View process status</li>
              <li>Restart individual processes</li>
              <li>View process logs</li>
              <li>Monitor resource usage</li>
            </ul>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}