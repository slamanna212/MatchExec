import { Card, CardBody, CardHeader } from '@heroui/react';

export default function SettingsPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-default-500 mt-2">Configure application and tournament settings</p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold">Discord Configuration</h2>
          </CardHeader>
          <CardBody>
            <p className="text-default-600">
              Configure Discord bot settings and permissions.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold">Tournament Defaults</h2>
          </CardHeader>
          <CardBody>
            <p className="text-default-600">
              Set default values for tournament creation and management.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold">Notification Settings</h2>
          </CardHeader>
          <CardBody>
            <p className="text-default-600">
              Configure how and when notifications are sent to participants.
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}