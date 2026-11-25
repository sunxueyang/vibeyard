export interface ToolInfo {
  command: string;
  name: string;
  description: string;
  authPatterns?: string[];
}

const tools: ToolInfo[] = [
  { command: 'gh', name: 'GitHub CLI', description: '高效访问 GitHub，替代网页抓取', authPatterns: ['gh auth login', 'gh auth status'] },
  { command: 'jq', name: 'jq', description: '高效处理 JSON' },
  { command: 'rg', name: 'ripgrep', description: '快速递归文本搜索' },
  { command: 'fd', name: 'fd', description: '快速查找文件' },
  { command: 'tree', name: 'tree', description: '目录结构可视化' },
  { command: 'yq', name: 'yq', description: '处理 YAML/XML/TOML' },
  { command: 'shellcheck', name: 'ShellCheck', description: 'Shell 脚本检查与分析' },
  { command: 'make', name: 'Make', description: '构建自动化' },
  { command: 'cmake', name: 'CMake', description: '生成跨平台构建系统' },
  { command: 'docker', name: 'Docker', description: '容器管理', authPatterns: ['docker login', 'unauthorized', 'denied: access forbidden'] },
  { command: 'kubectl', name: 'kubectl', description: 'Kubernetes 集群管理', authPatterns: ['unauthorized', "couldn't get current server api group list"] },
  { command: 'terraform', name: 'Terraform', description: '基础设施即代码编排', authPatterns: ['terraform login', 'no valid credential sources'] },
  { command: 'aws', name: 'AWS CLI', description: 'AWS 云服务管理', authPatterns: ['aws configure', 'unable to locate credentials', 'expiredtoken'] },
  { command: 'gcloud', name: 'Google Cloud CLI', description: 'Google Cloud 服务管理', authPatterns: ['gcloud auth login', 'unauthenticated'] },
  { command: 'az', name: 'Azure CLI', description: 'Azure 云服务管理', authPatterns: ['az login', "please run 'az login'"] },
  { command: 'python3', name: 'Python 3', description: 'Python 脚本与自动化' },
  { command: 'wget', name: 'wget', description: '从网络下载文件' },
];

const toolMap = new Map(tools.map(t => [t.command, t]));

export function findTool(command: string): ToolInfo | undefined {
  return toolMap.get(command);
}
