export default function DemoSubscriptionPage() {
  return (
    <main className="container">
      <div className="row">
        <div style={{ marginRight: "auto" }}>
          <h1>Subscription</h1>
          <p className="muted">Educational Demo equivalent of the real account/plan screen.</p>
        </div>
        <span className="demoReadOnlyBadge">Read-only</span>
      </div>
      <div className="card">
        <span className="eyebrow">Sample entitlement</span>
        <h2>Best Practice Demo Plan</h2>
        <p><strong>Status:</strong> ACTIVE — Demo only</p>
        <p><strong>Properties:</strong> 4 sample Properties</p>
        <p><strong>Users:</strong> Synthetic demonstration users</p>
        <p className="muted">
          Demo Workspace never creates billing records and does not represent a purchasable production plan.
        </p>
      </div>
    </main>
  );
}
