export default function StatCard({label,value,detail}){return <article className="stat-card"><span className="muted">{label}</span><strong>{value}</strong><small>{detail}</small></article>}
