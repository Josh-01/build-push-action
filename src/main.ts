import * as fs from 'fs';
import * as os from 'os';
import * as buildx from './buildx';
import * as context from './context';
import * as exec from './exec';
import * as stateHelper from './state-helper';
import * as core from '@actions/core';
import * as github from '@actions/github';

async function run(): Promise<void> {
  try {
    if (os.platform() !== 'linux') {
      throw new Error(`Only supported on linux platform`);
    }

    if (!(await buildx.isAvailable())) {
      throw new Error(`Buildx is required. See https://github.com/docker/setup-buildx-action to set up buildx.`);
    }
    stateHelper.setTmpDir(context.tmpDir());

    const buildxVersion = await buildx.getVersion();
    core.info(`📣 Buildx version: ${buildxVersion}`);

    const defContext = context.defaultContext();
    let inputs: context.Inputs = await context.getInputs(defContext);

    let dockerfilePath = core.getInput('file') || 'Dockerfile';
    core.info('🛒 Dockerfile path...');
    core.info(`${dockerfilePath}`);
    core.setOutput('dockerfilePath', dockerfilePath);
    inputs.labels.push(
      `org.opencontainers.image.source=https://github.com/${github.context.repo.owner}/${github.context.repo.repo}/${dockerfilePath}`
    );
    core.info(`🏃 Starting build...`);
    const args: string[] = await context.getArgs(inputs, defContext, buildxVersion);

    await exec.exec('docker', args).then(res => {
      if (res.stderr != '' && !res.success) {
        throw new Error(`buildx call failed with: ${res.stderr.match(/(.*)\s*$/)![0]}`);
      }
    });

    core.info(`🏃 Getting image info...`);
    let args2: string[] = [inputs.tags[0]];
    let inspectCommand: string = 'docker image inspect';
    if (inputs.push == true) {
      inputs.push = false;
      inputs.load = true;
      const args3: string[] = await context.getArgs(inputs, defContext, buildxVersion);

      await exec.exec('docker', args3).then(res => {
        if (res.stderr != '' && !res.success) {
          throw new Error(`docker images push failed with: ${res.stderr.match(/(.*)\s*$/)![0]}`);
        }
      });
    }

    await exec.exec(inspectCommand, args2).then(res => {
      if (res.stderr != '' && !res.success) {
        throw new Error(`image inspect call failed with: ${res.stderr.match(/(.*)\s*$/)![0]}`);
      }
      core.info(res.stdout.toString());
    });

    let imageID = await buildx.getImageID();
    if (imageID) {
      core.info('🛒 Extracting digest...');
      core.info(`${imageID}`);
      core.setOutput('digest', imageID);
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}

async function cleanup(): Promise<void> {
  if (stateHelper.tmpDir.length > 0) {
    core.info(`🚿 Removing temp folder ${stateHelper.tmpDir}`);
    fs.rmdirSync(stateHelper.tmpDir, {recursive: true});
  }
}

if (!stateHelper.IsPost) {
  run();
} else {
  cleanup();
}
