import * as React from 'react';
import { Link } from 'react-router-dom';
import { useK8sWatchResource } from '@openshift/dynamic-plugin-sdk-utils';
import {
  Alert,
  DescriptionList,
  DescriptionListGroup,
  DescriptionListTerm,
  DescriptionListDescription,
  Flex,
  FlexItem,
  ClipboardCopy,
  Spinner,
  Button,
  Tooltip,
} from '@patternfly/react-core';
import { PipelineRunLabel } from '../../../../consts/pipelinerun';
import { useAllEnvironments } from '../../../../hooks/useAllEnvironments';
import { useAllGitOpsDeploymentCRs } from '../../../../hooks/useGitOpsDeploymentCR';
import { useLatestSuccessfulBuildPipelineRunForComponent } from '../../../../hooks/usePipelineRuns';
import { useSnapshotsEnvironmentBindings } from '../../../../hooks/useSnapshotsEnvironmentBindings';
import { useTaskRuns } from '../../../../hooks/useTaskRuns';
import { DeploymentGroupVersionKind } from '../../../../models/deployment';
import CommitLabel from '../../../../shared/components/commit-label/CommitLabel';
import ErrorEmptyState from '../../../../shared/components/empty-state/ErrorEmptyState';
import { Timestamp } from '../../../../shared/components/timestamp/Timestamp';
import { HttpError } from '../../../../shared/utils/error/http-error';
import { ComponentKind, EnvironmentKind, GitOpsDeploymentKind } from '../../../../types';
import { SnapshotEnvironmentBinding } from '../../../../types/coreBuildService';
import { DeploymentKind } from '../../../../types/deployment';
import { getCommitsFromPLRs } from '../../../../utils/commits-utils';
import { useWorkspaceInfo } from '../../../../utils/workspace-context-utils';
import { useBuildLogViewerModal } from '../../../LogViewer/BuildLogViewer';
import ScanDescriptionListGroup from '../../../PipelineRunDetailsView/tabs/ScanDescriptionListGroup';
import PodLogsButton from '../../../PodLogs/PodLogsButton';

type DeploymentRowProps = {
  component: ComponentKind;
  gitOpsDeployments: GitOpsDeploymentKind[];
  snapshotEB: SnapshotEnvironmentBinding;
  environments: EnvironmentKind[];
};

const DeploymentRow: React.FC<DeploymentRowProps> = ({
  component,
  gitOpsDeployments,
  snapshotEB,
  environments,
}) => {
  const gitOpsDeploymentData = snapshotEB?.status?.gitopsDeployments?.find(
    (deployment) => deployment.componentName === component.metadata.name,
  );
  const gitOpsDeployment = gitOpsDeployments.find(
    (deployment) => deployment.metadata.name === gitOpsDeploymentData?.gitopsDeployment,
  );
  const deploymentResource = gitOpsDeployment?.status?.resources?.find(
    (resource) => resource.kind === 'Deployment',
  );
  const environmentName = snapshotEB.metadata.labels?.['appstudio.environment'];

  const [deployment, deploymentLoaded, deploymentLoadError] = useK8sWatchResource<DeploymentKind>({
    groupVersionKind: DeploymentGroupVersionKind,
    isList: false,
    name: deploymentResource?.name,
    namespace: deploymentResource?.namespace,
  });

  const environment = environments.find((env) => env.metadata.name === environmentName);

  const podSelector = React.useMemo(
    () =>
      environmentName === 'development' &&
      !deploymentLoadError &&
      deploymentLoaded &&
      deployment?.spec?.selector,
    [environmentName, deploymentLoadError, deploymentLoaded, deployment?.spec?.selector],
  );

  return (
    <div>
      <div>{environment?.spec.displayName || environmentName}</div>
      {podSelector ? (
        <PodLogsButton component={component} podSelector={podSelector} />
      ) : (
        <Tooltip content="Pod logs are not available">
          <div style={{ width: 'fit-content' }}>
            <Button variant="link" isInline isDisabled>
              View pod logs
            </Button>
          </div>
        </Tooltip>
      )}
    </div>
  );
};

type ComponentLatestBuildProps = {
  component: ComponentKind;
};

const ComponentLatestBuild: React.FC<ComponentLatestBuildProps> = ({ component }) => {
  const { namespace, workspace } = useWorkspaceInfo();
  const [pipelineRun, pipelineRunLoaded, error] = useLatestSuccessfulBuildPipelineRunForComponent(
    namespace,
    component.metadata.name,
  );
  const application = pipelineRun?.metadata?.labels?.[PipelineRunLabel.APPLICATION];
  const commit = React.useMemo(
    () => ((pipelineRunLoaded && pipelineRun && getCommitsFromPLRs([pipelineRun], 1)) || [])[0],
    [pipelineRunLoaded, pipelineRun],
  );
  const [taskRuns, taskRunsLoaded] = useTaskRuns(namespace, pipelineRun?.metadata?.name);
  const [snapshotEBs, sebLoaded] = useSnapshotsEnvironmentBindings(namespace, application);
  const [gitOpsDeployments, gitOpsDeploymentLoaded] = useAllGitOpsDeploymentCRs(namespace);
  const [environments, environmentsLoaded] = useAllEnvironments();
  const buildLogsModal = useBuildLogViewerModal(component);

  const deployments = React.useMemo(
    () =>
      sebLoaded &&
      snapshotEBs &&
      snapshotEBs.filter(
        (seb) => seb.spec.components?.find((c) => c.name === component.spec.componentName) || [],
      ),
    [component.spec.componentName, sebLoaded, snapshotEBs],
  );

  const containerImage = component.status?.containerImage;

  if (error) {
    const httpError = HttpError.fromCode((error as any).code);
    return (
      <ErrorEmptyState
        httpError={httpError}
        title={`Unable to load the latest build information.`}
        body={httpError.message}
      />
    );
  }

  if (
    !pipelineRunLoaded ||
    !taskRunsLoaded ||
    !sebLoaded ||
    !gitOpsDeploymentLoaded ||
    !environmentsLoaded
  ) {
    return (
      <div className="pf-u-m-lg">
        <Spinner />
      </div>
    );
  }

  if (!pipelineRun) {
    return <Alert variant="danger" isInline title="No successful build pipeline available" />;
  }
  return (
    <Flex direction={{ default: 'row' }}>
      <FlexItem style={{ flex: 1 }}>
        <DescriptionList
          columnModifier={{
            default: '1Col',
          }}
        >
          <DescriptionListGroup>
            <DescriptionListTerm>Build pipeline run</DescriptionListTerm>
            <DescriptionListDescription>
              <div className="component-details__build-completion">
                <div className="component-details__build-completion--time">
                  <div>Completed at</div>
                  <Timestamp timestamp={pipelineRun?.status?.completionTime ?? '-'} />
                </div>
                <Button
                  onClick={buildLogsModal}
                  variant="link"
                  data-testid={`view-build-logs-${component.metadata.name}`}
                  isInline
                >
                  View build logs
                </Button>
              </div>
            </DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>Triggered by</DescriptionListTerm>
            <DescriptionListDescription>
              {commit ? (
                <>
                  <Link
                    to={`/application-pipeline/workspaces/${workspace}/applications/${commit.application}/commit/${commit.sha}`}
                  >
                    {commit.isPullRequest ? `#${commit.pullRequestNumber}` : ''} {commit.shaTitle}
                  </Link>
                  {commit.shaURL && (
                    <>
                      {' '}
                      <CommitLabel
                        gitProvider={commit.gitProvider}
                        sha={commit.sha}
                        shaURL={commit.shaURL}
                      />
                    </>
                  )}
                </>
              ) : (
                '-'
              )}
            </DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>Deployed to</DescriptionListTerm>
            <DescriptionListDescription>
              {deployments.length ? (
                <div className="component-details__build-deployments">
                  {deployments.map((deployment) => (
                    <DeploymentRow
                      key={deployment.metadata.uid}
                      component={component}
                      gitOpsDeployments={gitOpsDeployments}
                      snapshotEB={deployment}
                      environments={environments}
                    />
                  ))}
                </div>
              ) : (
                '-'
              )}
            </DescriptionListDescription>
          </DescriptionListGroup>
        </DescriptionList>
      </FlexItem>
      <FlexItem style={{ flex: 1 }}>
        <DescriptionList
          columnModifier={{
            default: '1Col',
          }}
        >
          <DescriptionListGroup>
            <DescriptionListTerm>SBOM</DescriptionListTerm>
            <DescriptionListDescription>
              <ClipboardCopy isReadOnly hoverTip="Copy" clickTip="Copied">
                {`cosign download sbom ${containerImage}`}
              </ClipboardCopy>
            </DescriptionListDescription>
          </DescriptionListGroup>
          <DescriptionListGroup>
            <DescriptionListTerm>Build container image</DescriptionListTerm>
            <DescriptionListDescription>
              <ClipboardCopy isReadOnly hoverTip="Copy" clickTip="Copied">
                {containerImage}
              </ClipboardCopy>
            </DescriptionListDescription>
          </DescriptionListGroup>
          <ScanDescriptionListGroup taskRuns={taskRuns} showLogsLink />
        </DescriptionList>
      </FlexItem>
    </Flex>
  );
};

export default React.memo(ComponentLatestBuild);
