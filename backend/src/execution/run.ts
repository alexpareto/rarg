import { prisma } from "@/clients";
import { executePrograms, type ExecuteResult } from "@/execution/execute";
import { rewriteProgram } from "@/execution/rewrite";
import {
  Program,
  ProgramVersion,
  type ProgramInvocation,
} from "@prisma/client";

const getAllProgramVersionDependencies = async (
  programVersion: ProgramVersion
) => {
  let allProgramVersionDepedencies: ProgramVersion[] = [];

  let currentProgramDependencies: Program[] = await prisma.program.findMany({
    where: {
      dependents: {
        some: {
          id: programVersion.id,
        },
      },
    },
  });

  while (currentProgramDependencies.length > 0) {
    console.log("a");

    let newProgramDependencies: Program[] = [];
    for (const program of currentProgramDependencies) {
      const programVersion = await prisma.programVersion.findFirst({
        where: {
          programId: program.id,
        },
        orderBy: {
          fitness: "desc", // Assuming the field is named 'fitnessScore'
        },
        include: {
          dependencies: true,
          program: true,
        },
      });

      allProgramVersionDepedencies.push(programVersion!);

      newProgramDependencies.push(...programVersion!.dependencies);
    }
    currentProgramDependencies = newProgramDependencies;
  }
  return allProgramVersionDepedencies;
};

type ExecutionNode = {
  id: string;
  name: string;
  inputArgs: any;
  output: any | null;
  children: ExecutionNode[];
};

const MAX_RUN_RETRIES = 3;

export const runProgram = async (
  programVersionIn: ProgramVersion,
  args: any[]
): Promise<ExecuteResult | ProgramInvocation> => {
  let programVersion = await prisma.programVersion.findFirst({
    where: {
      id: programVersionIn.id,
    },
    include: {
      program: true,
    },
  });

  const programVersionDependencies = await getAllProgramVersionDependencies(
    programVersion!
  );
  console.log("Dependencies", programVersionDependencies);

  const allProgramVersions = [...programVersionDependencies, programVersion!];

  const program = await prisma.program.findFirst({
    where: {
      id: programVersion!.programId,
    },
  });

  const formattedArgs = JSON.stringify(args);
  const programToRun = `
  import { runProgram } from "./core";
  import { updateState, updateStateResult } from "./core";
  
  function __import_hack() {
    return {
      updateState,
      updateStateResult,
    };
  }
  
  ${allProgramVersions.map((pv) => pv.body).join("\n")}

  const rawArgs = "${formattedArgs}"
const result = runProgram(${program!.name}, rawArgs)
  `;

  const result = await executePrograms(programToRun);

  if (result.errorType !== null) {
    try {
      await rewriteProgram(allProgramVersions, result.error!, result.errorType);
    } catch (e) {
      return result;
    }

    return runProgram(programVersion!, args);
  }

  const rootNode = result.value;

  let rootInvocation: ProgramInvocation | null = null;

  const createProgramInvocations = async (
    node: ExecutionNode,
    previousInvocationId: number | null = null
  ) => {
    console.log(allProgramVersions);
    const programVersionForNode = allProgramVersions.find(
      (pv) => (pv as any).program.name === node.name
    )!;
    const programInvocation = await prisma.programInvocation.create({
      data: {
        programVersion: { connect: { id: programVersionForNode.id } },
        inputArgs: node.inputArgs,
        outputArgs: node.output,
        previousInvocation: previousInvocationId
          ? { connect: { id: previousInvocationId } }
          : undefined,
      },
    });

    if (previousInvocationId === null) {
      rootInvocation = programInvocation;
    }

    for (const child of node.children) {
      await createProgramInvocations(child, programInvocation.id);
    }
  };

  await createProgramInvocations(rootNode);

  return rootInvocation!; // Return the root invocation from runProgram
};
